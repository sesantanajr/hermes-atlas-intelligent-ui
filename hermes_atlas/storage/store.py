"""SQLite library of canvases, conversations and runs, scoped to one Hermes profile and gateway."""
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone

from .. import LEGACY_PLUGIN_NAMES, PLUGIN_NAME
from ..chat.activity import summarize
from ..chat.delivery import present_conversation, present_reply
from ..runtime import data_dir
from .identity import bind_workspace

CANVAS_LIMIT_BYTES = 256_000


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


def keep_private(path):
    """Owner-only access to a new library (it holds Atlas chats and their attachments), and to its
    folder when that is Atlas's own ``plugin-data`` folder. POSIX only; failures are ignored."""
    if os.name != "posix":
        return
    try:
        os.chmod(path, 0o600)
        folder = os.path.dirname(os.path.abspath(path))
        if os.path.basename(folder) in (PLUGIN_NAME, *LEGACY_PLUGIN_NAMES):
            os.chmod(folder, 0o700)
    except OSError:
        pass


class Store:
    def __init__(self, path=None):
        self.path = path or data_dir() / "atlas.db"
        fresh = not os.path.exists(self.path)
        with closing(self.connect()) as db, db:
            if db.execute("PRAGMA user_version").fetchone()[0] < 1:
                self._upgrade_documents()
            self._scope = bind_workspace(db, self.path)
        if fresh:
            keep_private(self.path)

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

    def save(self, canvas, expected_revision=None, dedup_key=None):
        """Append an immutable revision of a validated ``Canvas`` (any object with ``id``, ``title``
        and ``model_dump_json``; the schema package is deliberately not imported here)."""
        payload = canvas.model_dump_json()
        if len(payload.encode()) > CANVAS_LIMIT_BYTES:
            raise ValueError("O canvas excede o limite de 256 KB.")
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
            return self._conversation(db, record) if kind == 'conversation' else record

    def _conversation(self, db, record):
        if record:
            legacy = {m['id'][:-7]: m for m in record.get('messages', [])
                      if m.get('role') == 'assistant' and m.get('id', '').endswith('-answer') and 'activity' not in m}
            if legacy:
                rows = db.execute("""
                    SELECT id, json_extract(payload,'$.events'), json_extract(payload,'$.events_truncated')
                    FROM documents WHERE owner=? AND kind='run' AND id IN (SELECT value FROM json_each(?))
                """, (self.scope, json.dumps(list(legacy))))
                for run_id, events_json, truncated in rows:
                    if events_json:
                        events = json.loads(events_json)
                        activity = summarize(events, limited=truncated or len(events)>=60, terminal=True)
                        if activity:
                            legacy[run_id]['activity'] = activity
        return present_conversation(record)

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
            return self._conversation(db, json.loads(row[0])) if row else None

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
                    events = run.get('events', [])
                    answer['activity'] = summarize(events, limited=run.get('events_truncated',len(events)>=60), terminal=True)
                    conversation['messages'].append(answer)
                conversation['active_run'] = None
                self.put('conversation', conversation['id'], conversation, db)
                self.put('run', run['id'], run, db)

    # -- canvases made by the agent, and what the user did to them afterwards -------------------
    def link_canvas(self, canvas_id, revision, *, conversation_id="", session_id=""):
        """Remember which agent conversation produced (or last rewrote) a canvas revision."""
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM documents WHERE kind='canvas_link' AND id=? AND owner=?",
                             (canvas_id, self.scope)).fetchone()
            link = json.loads(row[0]) if row else {"canvas_id": canvas_id}
            link["agent_revision"] = revision
            if conversation_id:
                link["conversation_id"] = conversation_id
            if session_id:
                link["session_id"] = session_id
            link["noted"] = datetime.now(timezone.utc).isoformat()
            self.put('canvas_link', canvas_id, link, db)
        return link

    def mark_seen(self, canvas_id):
        """The agent just read this canvas: what the user did before now needs no further notice."""
        with closing(self.connect()) as db, db:
            db.execute(
                "UPDATE documents SET payload=json_set(payload,'$.noted',?) WHERE kind='canvas_link' AND id=? AND owner=?",
                (datetime.now(timezone.utc).isoformat(), canvas_id, self.scope))

    def user_changes(self, session_ids, *, acknowledge=True, limit=5):
        """Canvases of these agent sessions that the user saved or edited since the agent last saw them.

        Returns ``[{id, title, revision, agent_revision, kind}]`` where ``kind`` is ``"revision"`` (the
        user saved a newer version) or ``"draft"`` (unsaved interaction state). With *acknowledge*
        each change is reported once.
        """
        wanted = [s for s in dict.fromkeys(session_ids) if s]
        if not wanted:
            return []
        with closing(self.connect()) as db:
            # Runs before every agent turn: plain reads first, so the common case (nothing changed)
            # never takes the write lock that the dashboard and the Atlas chat also need.
            pending = self._pending_changes(db, wanted, limit)
            if not pending or not acknowledge:
                return [change for change, _ in pending]
            with db:
                db.execute("BEGIN IMMEDIATE")
                # Again under the lock: another process may have reported the same change meanwhile.
                pending = self._pending_changes(db, wanted, limit)
                noted = datetime.now(timezone.utc).isoformat()
                for change, link in pending:
                    link["noted"] = noted
                    self.put('canvas_link', change["id"], link, db)
        return [change for change, _ in pending]

    def _pending_changes(self, db, wanted, limit):
        marks = ",".join("?" * len(wanted))
        rows = db.execute(
            "SELECT id, payload FROM documents WHERE kind='canvas_link' AND owner=?"
            " AND (json_extract(payload,'$.conversation_id') IN (" + marks + ")"
            " OR json_extract(payload,'$.session_id') IN (" + marks + "))"
            " ORDER BY updated DESC LIMIT 50", (self.scope, *wanted, *wanted)).fetchall()
        pending = []
        for canvas_id, raw in rows:
            link = json.loads(raw)
            latest = db.execute(
                "SELECT revision, title, updated FROM owned_canvases WHERE owner=? AND id=?"
                " ORDER BY revision DESC LIMIT 1", (self.scope, canvas_id)).fetchone()
            if latest is None:
                continue
            noted = link.get("noted", "")
            draft = db.execute("SELECT updated FROM documents WHERE kind='canvas_draft' AND id=? AND owner=?",
                               (canvas_id, self.scope)).fetchone()
            kind = None
            if latest["revision"] > link.get("agent_revision", 0) and latest["updated"] > noted:
                kind = "revision"
            elif draft and draft[0] > noted:
                kind = "draft"
            if not kind:
                continue
            pending.append(({"id": canvas_id, "title": latest["title"], "revision": latest["revision"],
                             "agent_revision": link.get("agent_revision", 0), "kind": kind}, link))
            if len(pending) >= limit:
                break
        return pending

    # -- unsaved interaction state of one canvas (inline canvases autosave here) ----------------
    def draft(self, canvas_id):
        record = self.doc('canvas_draft', canvas_id)
        if record:
            record["token"] = self._workspace_token(record["canvas"])
        return record

    def save_draft(self, canvas, base_revision, expected_token=None):
        """Keep the user's in-progress state of a saved canvas without creating a revision."""
        value = json.loads(canvas.model_dump_json())
        if len(json.dumps(value).encode()) > CANVAS_LIMIT_BYTES:
            raise ValueError("O canvas excede o limite de 256 KB.")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM owned_canvases WHERE owner=? AND id=? AND revision=?",
                              (self.scope, canvas.id, base_revision)).fetchone():
                raise KeyError(canvas.id)
            row = db.execute("SELECT payload FROM documents WHERE kind='canvas_draft' AND id=? AND owner=?",
                             (canvas.id, self.scope)).fetchone()
            if row and expected_token is not None:
                if self._workspace_token(json.loads(row[0])["canvas"]) != expected_token:
                    raise ValueError("O rascunho foi alterado em outra aba.")
            record = {"id": canvas.id, "base_revision": base_revision, "canvas": value,
                      "updated": datetime.now(timezone.utc).isoformat()}
            self.put('canvas_draft', canvas.id, record, db)
        return {**record, "token": self._workspace_token(value)}

    def discard_draft(self, canvas_id):
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM documents WHERE kind='canvas_draft' AND id=? AND owner=?", (canvas_id, self.scope))

    def delete_canvas(self, canvas_id):
        """Remove every revision of a canvas from this workspace. Messages that pointed at it keep
        their text; opening the canvas from them then reports that it is gone."""
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            removed = db.execute("DELETE FROM owned_canvases WHERE owner=? AND id=?", (self.scope, canvas_id)).rowcount
            db.execute("DELETE FROM documents WHERE owner=? AND id=? AND kind IN ('canvas_link','canvas_draft')",
                       (self.scope, canvas_id))
            db.execute(
                "UPDATE documents SET payload=json_set(payload,'$.canvas',NULL,'$.revision',0)"
                " WHERE owner=? AND kind='workspace' AND id='current' AND json_extract(payload,'$.canvas.id')=?",
                (self.scope, canvas_id))
            return removed > 0

    # -- which Atlas front ends have been seen in this workspace ---------------------------------
    def touch_client(self, kind, info=None):
        record = {**(info or {}), "kind": kind, "seen": datetime.now(timezone.utc).isoformat()}
        self.put('client', kind, record)
        return record

    def client(self, kind, *, within_days=45):
        record = self.doc('client', kind)
        if not record:
            return None
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(record["seen"])
        except (KeyError, ValueError):
            return None
        return record if age <= timedelta(days=within_days) else None

    def stats(self):
        with closing(self.connect()) as db:
            canvases, revisions = db.execute(
                "SELECT COUNT(DISTINCT id), COUNT(*) FROM owned_canvases WHERE owner=?", (self.scope,)).fetchone()
            chats = db.execute("SELECT COUNT(*) FROM documents WHERE owner=? AND kind='conversation'",
                               (self.scope,)).fetchone()[0]
        return {"canvases": canvases, "revisions": revisions, "conversations": chats}
