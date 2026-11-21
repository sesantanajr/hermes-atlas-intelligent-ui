import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from .models import Canvas
from .delivery import present_conversation, present_reply
from .workspace_identity import bind_workspace


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


def _next_run_stamp(previous):
    # Keep a run's cursor moving if the clock is adjusted or two writes share a tick.
    now = datetime.now(timezone.utc)
    if previous and previous >= now.isoformat():
        try:
            prior = datetime.fromisoformat(previous)
            if prior.tzinfo and prior >= now:
                now = prior + timedelta(microseconds=1)
        except ValueError:
            pass  # Older or imported databases may have non-ISO timestamps.
    return now.isoformat()


class Store:
    def __init__(self, path=None):
        self.path = path or data_dir() / "atlas.db"
        with closing(self.connect()) as db, db:
            if db.execute("PRAGMA user_version").fetchone()[0] < 1:
                self._upgrade_documents()
            self._scope = bind_workspace(db, self.path)

    def _upgrade_documents(self):
        with closing(self.connect()) as db, db:
            if db.execute("PRAGMA user_version").fetchone()[0] >= 1:
                return
            db.execute("BEGIN IMMEDIATE")
            if db.execute("PRAGMA user_version").fetchone()[0] >= 1:
                return
            db.execute("CREATE TABLE IF NOT EXISTS canvases (id TEXT, revision INTEGER, title TEXT, updated TEXT, payload TEXT, PRIMARY KEY(id, revision))")
            db.execute("CREATE TABLE IF NOT EXISTS documents (kind TEXT, id TEXT, owner TEXT, payload TEXT, updated TEXT, PRIMARY KEY(kind,id,owner))")
            db.execute("""
                CREATE INDEX IF NOT EXISTS conversation_listing ON documents
                (owner, updated DESC, id, json_extract(payload, '$.title'), json_extract(payload, '$.active_run'))
                WHERE kind='conversation'
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS conversation_runs ON documents
                (owner, json_extract(payload, '$.conversation_id'), id) WHERE kind='run'
            """)
            # Early releases could persist the terminal status returned by a replay
            # before retrieving its result. Only reopen runs still holding their chat.
            db.execute("""
                UPDATE documents AS run SET payload=json_set(payload, '$.status', 'running')
                WHERE kind='run' AND json_extract(payload, '$.remote_id') IS NOT NULL
                  AND json_extract(payload, '$.status') IN ('completed','failed','interrupted','cancelled')
                  AND EXISTS (SELECT 1 FROM documents AS chat WHERE chat.kind='conversation'
                    AND chat.owner=run.owner AND chat.id=json_extract(run.payload, '$.conversation_id')
                    AND json_extract(chat.payload, '$.active_run')=run.id)
            """)
            # v0.2 deleted only the chat row. Retire orphaned run data using
            # exactly the same rules as a new deletion, including replay fences.
            orphans = db.execute("""
                SELECT owner, id, json_extract(payload, '$.conversation_id') FROM documents AS run
                WHERE kind='run' AND NOT EXISTS (SELECT 1 FROM documents AS chat WHERE
                    chat.kind='conversation' AND chat.owner=run.owner AND chat.id=json_extract(run.payload, '$.conversation_id'))
            """).fetchall()
            for owner, run_id, chat_id in orphans:
                self._retire_run(db, owner, run_id)
                self._mark_deleted(db, owner, 'deleted_conversation', chat_id)
            db.execute("PRAGMA user_version=1")

    @property
    def scope(self):
        return self._scope

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.create_function("atlas_casefold", 1, str.casefold, deterministic=True)
        db.create_function("atlas_next_run_stamp", 1, _next_run_stamp)
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
            revision = db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM owned_canvases WHERE owner=? AND id=?", (self.scope, canvas.id)).fetchone()[0]
            if expected_revision is not None and revision - 1 != expected_revision:
                raise ValueError("Este canvas mudou em outra janela. Abra a última versão antes de salvar.")
            updated = datetime.now(timezone.utc).isoformat()
            db.execute("INSERT INTO owned_canvases VALUES (?,?,?,?,?,?)", (self.scope, canvas.id, revision, canvas.title, updated, payload))
            record = {"id": canvas.id, "revision": revision, "updated": updated, "canvas": json.loads(payload)}
            if dedup_key:
                self.put('artifact_run', dedup_key, record, db)
        return record

    def list(self, offset=0, limit=100, q=''):
        with closing(self.connect()) as db:
            rows = db.execute("""
                SELECT c.id,c.revision,c.title,c.updated FROM owned_canvases c
                JOIN (SELECT owner, id, MAX(revision) revision FROM owned_canvases WHERE owner=? GROUP BY owner,id) latest USING(owner,id,revision)
                WHERE instr(atlas_casefold(c.title), ?) > 0
                ORDER BY updated DESC, id LIMIT ? OFFSET ?
            """, (self.scope, q.strip().casefold(), limit, offset)).fetchall()
            return [dict(row) for row in rows]

    def get(self, id, revision=None):
        with closing(self.connect()) as db:
            if revision is None:
                row = db.execute("SELECT * FROM owned_canvases WHERE owner=? AND id=? ORDER BY revision DESC LIMIT 1", (self.scope, id)).fetchone()
            else:
                row = db.execute("SELECT * FROM owned_canvases WHERE owner=? AND id=? AND revision=?", (self.scope, id, revision)).fetchone()
            if not row:
                return None
            return {"id": row["id"], "revision": row["revision"], "updated": row["updated"], "canvas": json.loads(row["payload"])}

    def versions(self, id):
        with closing(self.connect()) as db:
            return [dict(r) for r in db.execute("SELECT id,revision,title,updated FROM owned_canvases WHERE owner=? AND id=? ORDER BY revision DESC LIMIT 100", (self.scope, id))]

    def doc(self, kind, id):
        with closing(self.connect()) as db:
            row = db.execute("SELECT payload FROM documents WHERE kind=? AND id=? AND owner=?", (kind, id, self.scope)).fetchone()
            record = json.loads(row[0]) if row else None
            return present_conversation(record) if kind == 'conversation' else record

    def observe(self, id, cursor=None):
        """Read the change token and its snapshot atomically. An unchanged poll skips the JSON."""
        with closing(self.connect()) as db:
            row = db.execute("""
                SELECT token, CASE WHEN token = ? THEN NULL ELSE payload END
                FROM (SELECT rowid || ':' || updated AS token, payload
                      FROM documents WHERE kind='run' AND owner=? AND id=?)
            """, (cursor, self.scope, id)).fetchone()
            if row is None:
                return None
            return row[0], json.loads(row[1]) if row[1] is not None else None

    @staticmethod
    def _workspace_token(value):
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
        return hashlib.sha256(encoded).hexdigest()

    def workspace(self, defaults):
        value = self.doc('workspace', 'current') or defaults
        return {**value, 'workspace_token': self._workspace_token(value)}

    def save_workspace(self, value, defaults, expected_token=None):
        # The transaction also fences writes from older clients that omit the token.
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM documents WHERE owner=? AND kind='workspace' AND id='current'",
                             (self.scope,)).fetchone()
            current = json.loads(row[0]) if row else defaults
            if self._workspace_token(value) != self._workspace_token(current):
                if expected_token is not None and self._workspace_token(current) != expected_token:
                    raise ValueError("O rascunho foi alterado em outra aba.")
                self.put('workspace', 'current', value, db)
        return {**value, 'workspace_token': self._workspace_token(value)}

    def put(self, kind, id, value, db=None):
        if db is None:
            with closing(self.connect()) as conn, conn:
                return self.put(kind, id, value, conn)
        db.execute("INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?)", (kind, id, self.scope, json.dumps(value, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        return value

    def checkpoint(self, run):
        # An observer in another process may have finished or deleted the run.
        # A late checkpoint must never resurrect one of those records.
        with closing(self.connect()) as db, db:
            updated = db.execute("""
                UPDATE documents SET payload=?, updated=atlas_next_run_stamp(updated)
                WHERE kind='run' AND owner=? AND id=?
                  AND json_extract(payload, '$.status') NOT IN ('completed','failed','cancelled','interrupted','unknown')
            """, (json.dumps(run, ensure_ascii=False), self.scope, run['id']))
            return updated.rowcount == 1

    def conversations(self, offset=0, limit=50, q=''):
        with closing(self.connect()) as db:
            rows = db.execute("""
                SELECT id, json_extract(payload,'$.title') AS title,
                       json_extract(payload,'$.active_run') AS active_run
                FROM documents WHERE kind='conversation' AND owner=?
                  AND instr(atlas_casefold(json_extract(payload,'$.title')), ?) > 0
                ORDER BY updated DESC, id LIMIT ? OFFSET ?
            """, (self.scope, q.strip().casefold(), limit, offset))
            return [dict(row) for row in rows]

    def rename_conversation(self, id, title):
        with closing(self.connect()) as db, db:
            row = db.execute("""
                UPDATE documents SET payload=json_set(payload,'$.title',?), updated=?
                WHERE kind='conversation' AND owner=? AND id=? RETURNING payload
            """, (title, datetime.now(timezone.utc).isoformat(), self.scope, id)).fetchone()
            return present_conversation(json.loads(row[0])) if row else None

    @staticmethod
    def _mark_deleted(db, owner, kind, id):
        db.execute("INSERT OR IGNORE INTO documents(kind,id,owner,payload,updated) VALUES (?,?,?,'{}',?)",
                   (kind, id, owner, datetime.now(timezone.utc).isoformat()))

    def _retire_run(self, db, owner, run_id):
        self._mark_deleted(db, owner, 'deleted_run', run_id)
        db.execute("DELETE FROM documents WHERE owner=? AND id=? AND kind IN ('run','artifact_run')", (owner, run_id))

    def delete_conversation(self, id):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""
                SELECT json_extract(payload,'$.active_run') FROM documents
                WHERE kind='conversation' AND owner=? AND id=?
            """, (self.scope, id)).fetchone()
            if row is None:
                return False
            if row[0]:
                raise ValueError("Interrompa e aguarde a execução terminar antes de excluir a conversa.")
            run_ids = db.execute("""
                SELECT id FROM documents WHERE kind='run' AND owner=?
                AND json_extract(payload,'$.conversation_id')=?
            """, (self.scope, id)).fetchall()
            for (run_id,) in run_ids:
                self._retire_run(db, self.scope, run_id)
            self._mark_deleted(db, self.scope, 'deleted_conversation', id)
            db.execute("DELETE FROM documents WHERE kind='conversation' AND owner=? AND id=?", (self.scope, id))
            db.execute("""
                UPDATE documents SET payload=json_set(payload,'$.chat_id',NULL)
                WHERE owner=? AND kind='workspace' AND id='current' AND json_extract(payload,'$.chat_id')=?
            """, (self.scope, id))
            return True

    def resume_remote_unknown(self, id):
        with closing(self.connect()) as db, db:
            db.execute("""
                UPDATE documents SET payload=json_set(payload, '$.status', 'running'), updated=atlas_next_run_stamp(updated)
                WHERE owner=? AND kind='run' AND id=? AND json_extract(payload, '$.status')='unknown'
                  AND json_extract(payload, '$.remote_id') IS NOT NULL
            """, (self.scope, id))

    def reserve(self, request_id, conversation_id, payload, message, request_hash=None, retention=None):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            deleted = db.execute("""
                SELECT 1 FROM documents WHERE owner=?
                  AND ((kind='deleted_conversation' AND id=?) OR (kind='deleted_run' AND id=?))
            """, (self.scope, conversation_id, request_id)).fetchone()
            if deleted:
                raise ValueError("Esta conversa ou execução já foi excluída.")
            row = db.execute("SELECT payload FROM documents WHERE kind='run' AND id=? AND owner=?", (request_id, self.scope)).fetchone()
            if row:
                run = json.loads(row[0])
                matches = (run['request_hash'] == request_hash if request_hash and run.get('request_hash')
                           else run['payload'] == payload)
                if not matches or run['conversation_id'] != conversation_id:
                    raise ValueError("A chave desta execução já pertence a outro pedido.")
                return run
            row = db.execute("SELECT payload FROM documents WHERE kind='conversation' AND id=? AND owner=?", (conversation_id, self.scope)).fetchone()
            conversation = json.loads(row[0]) if row else {"id": conversation_id, "title": message[:55], "messages": []}
            if conversation.get('active_run'):
                raise ValueError("Esta conversa já possui uma execução em andamento.")
            now = datetime.now(timezone.utc).isoformat()
            run = {"id": request_id, "conversation_id": conversation_id, "payload": payload, "status": "submitting", "remote_id": None, "text": "", "events": [], "created": now, "artifact": None, "warning": None, "pending_controls": []}
            if request_hash:
                run['request_hash'] = request_hash
            if isinstance(retention, int) and retention > 0:
                run['retry_window'] = min(23 * 3600, retention * 0.95)
            conversation['messages'].append({"id": request_id, "role": "user", "content": message, "created": now})
            conversation['active_run'] = request_id
            self.put('conversation', conversation_id, conversation, db)
            return self.put('run', request_id, run, db)

    def finish(self, run):
        run = present_reply(run, 'text')
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM documents WHERE kind='conversation' AND id=? AND owner=?", (run['conversation_id'], self.scope)).fetchone()
            if row:
                conversation = json.loads(row[0])
                if conversation.get('active_run') != run['id']:
                    return
                if not any(m['id'] == run['id'] + '-answer' for m in conversation['messages']):
                    answer = {"id": run['id'] + '-answer', "role": "assistant", "content": run['text'],
                              "created": datetime.now(timezone.utc).isoformat(),
                              "artifact": {k: run['artifact'][k] for k in ('id', 'revision')} if run.get('artifact') else None,
                              "status": run['status'], "warning": run.get('warning'), "usage": run.get('usage')}
                    if run.get('delivery') == 'silent':
                        answer['delivery'] = 'silent'
                    conversation['messages'].append(answer)
                conversation['active_run'] = None
                self.put('conversation', conversation['id'], conversation, db)
                self.put('run', run['id'], run, db)
