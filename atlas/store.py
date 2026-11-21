import json
import os
import sqlite3
import hashlib
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from .models import Canvas


def data_dir():
    if os.environ.get("ATLAS_DATA_DIR"):
        root = Path(os.environ["ATLAS_DATA_DIR"]).expanduser()
    else:
        try:
            from plugins.plugin_storage import plugin_data_dir
            return plugin_data_dir("hermes-atlas")
        except ImportError:
            # Same convention as Hermes; set HERMES_HOME for non-default profiles.
            root = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))) / "plugin-data" / "hermes-atlas"
    root.mkdir(parents=True, exist_ok=True)
    return root


class Store:
    def __init__(self, path=None):
        self.path = path or data_dir() / "atlas.db"
        from .gateway import setting
        identity = str(Path(self.path).resolve()) + setting('ATLAS_HERMES_URL') + (setting('ATLAS_HERMES_API_KEY') or setting('API_SERVER_KEY'))
        self._scope = hashlib.sha256(identity.encode()).hexdigest()[:24]
        with closing(self.connect()) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS canvases (id TEXT, revision INTEGER, title TEXT, updated TEXT, payload TEXT, PRIMARY KEY(id, revision))")
            db.execute("CREATE TABLE IF NOT EXISTS documents (kind TEXT, id TEXT, owner TEXT, payload TEXT, updated TEXT, PRIMARY KEY(kind,id,owner))")

    @property
    def scope(self):
        return self._scope

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def save(self, canvas: Canvas, expected_revision=None, dedup_key=None):
        payload = canvas.model_dump_json()
        if len(payload.encode()) > 256_000:
            raise ValueError("Canvas exceeds 256 KB")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if dedup_key:
                prior = db.execute("SELECT payload FROM documents WHERE kind='artifact_run' AND id=? AND owner=?", (dedup_key, self.scope)).fetchone()
                if prior:
                    return json.loads(prior[0])
            revision = db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM canvases WHERE id=?", (canvas.id,)).fetchone()[0]
            if expected_revision is not None and revision - 1 != expected_revision:
                raise ValueError("Este canvas mudou em outra janela. Abra a última versão antes de salvar.")
            updated = datetime.now(timezone.utc).isoformat()
            db.execute("INSERT INTO canvases VALUES (?,?,?,?,?)", (canvas.id, revision, canvas.title, updated, payload))
            record = {"id": canvas.id, "revision": revision, "updated": updated, "canvas": json.loads(payload)}
            if dedup_key:
                self.put('artifact_run', dedup_key, record, db)
        return record

    def list(self, offset=0, limit=100):
        with closing(self.connect()) as db:
            rows = db.execute("SELECT c.id,c.revision,c.title,c.updated FROM canvases c JOIN (SELECT id, MAX(revision) revision FROM canvases GROUP BY id) latest USING(id,revision) ORDER BY updated DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
            return [dict(row) for row in rows]

    def get(self, id, revision=None):
        with closing(self.connect()) as db:
            if revision is None:
                row = db.execute("SELECT * FROM canvases WHERE id=? ORDER BY revision DESC LIMIT 1", (id,)).fetchone()
            else:
                row = db.execute("SELECT * FROM canvases WHERE id=? AND revision=?", (id, revision)).fetchone()
            if not row:
                return None
            return {"id": row["id"], "revision": row["revision"], "updated": row["updated"], "canvas": json.loads(row["payload"])}

    def versions(self, id):
        with closing(self.connect()) as db:
            return [dict(r) for r in db.execute("SELECT id,revision,title,updated FROM canvases WHERE id=? ORDER BY revision DESC LIMIT 100", (id,))]

    def doc(self, kind, id):
        with closing(self.connect()) as db:
            row = db.execute("SELECT payload FROM documents WHERE kind=? AND id=? AND owner=?", (kind, id, self.scope)).fetchone()
            return json.loads(row[0]) if row else None

    def put(self, kind, id, value, db=None):
        if db is None:
            with closing(self.connect()) as conn, conn:
                return self.put(kind, id, value, conn)
        db.execute("INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?)", (kind, id, self.scope, json.dumps(value, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        return value

    def docs(self, kind, offset=0, limit=100):
        with closing(self.connect()) as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM documents WHERE kind=? AND owner=? ORDER BY updated DESC LIMIT ? OFFSET ?", (kind, self.scope, limit, offset))]

    def delete_doc(self, kind, id):
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM documents WHERE kind=? AND id=? AND owner=?", (kind, id, self.scope))

    def reserve(self, request_id, conversation_id, payload, message):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM documents WHERE kind='run' AND id=? AND owner=?", (request_id, self.scope)).fetchone()
            if row:
                run = json.loads(row[0])
                if run['payload'] != payload or run['conversation_id'] != conversation_id:
                    raise ValueError("A chave desta execução já pertence a outro pedido.")
                return run
            row = db.execute("SELECT payload FROM documents WHERE kind='conversation' AND id=? AND owner=?", (conversation_id, self.scope)).fetchone()
            conversation = json.loads(row[0]) if row else {"id": conversation_id, "title": message[:55], "messages": []}
            if conversation.get('active_run'):
                raise ValueError("Esta conversa já possui uma execução em andamento.")
            now = datetime.now(timezone.utc).isoformat()
            run = {"id": request_id, "conversation_id": conversation_id, "payload": payload, "status": "submitting", "remote_id": None, "text": "", "events": [], "created": now, "artifact": None, "warning": None, "pending_controls": []}
            conversation['messages'].append({"id": request_id, "role": "user", "content": message, "created": now})
            conversation['active_run'] = request_id
            self.put('conversation', conversation_id, conversation, db)
            return self.put('run', request_id, run, db)

    def finish(self, run):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM documents WHERE kind='conversation' AND id=? AND owner=?", (run['conversation_id'], self.scope)).fetchone()
            if row:
                conversation = json.loads(row[0])
                if not any(m['id'] == run['id'] + '-answer' for m in conversation['messages']):
                    conversation['messages'].append({"id": run['id'] + '-answer', "role": "assistant", "content": run['text'], "created": datetime.now(timezone.utc).isoformat(), "artifact": {k: run['artifact'][k] for k in ('id', 'revision')} if run.get('artifact') else None, "status": run['status'], "warning": run.get('warning'), "usage": run.get('usage')})
                conversation['active_run'] = None
                self.put('conversation', conversation['id'], conversation, db)
            self.put('run', run['id'], run, db)
