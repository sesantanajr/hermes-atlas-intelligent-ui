import json
import os
import sqlite3
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
        with closing(self.connect()) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS canvases (id TEXT, revision INTEGER, title TEXT, updated TEXT, payload TEXT, PRIMARY KEY(id, revision))")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def save(self, canvas: Canvas):
        payload = canvas.model_dump_json()
        if len(payload.encode()) > 256_000:
            raise ValueError("Canvas exceeds 256 KB")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            revision = db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM canvases WHERE id=?", (canvas.id,)).fetchone()[0]
            updated = datetime.now(timezone.utc).isoformat()
            db.execute("INSERT INTO canvases VALUES (?,?,?,?,?)", (canvas.id, revision, canvas.title, updated, payload))
        return {"id": canvas.id, "revision": revision, "updated": updated, "canvas": canvas.model_dump()}

    def list(self):
        with closing(self.connect()) as db:
            rows = db.execute("SELECT c.id,c.revision,c.title,c.updated FROM canvases c JOIN (SELECT id, MAX(revision) revision FROM canvases GROUP BY id) latest USING(id,revision) ORDER BY updated DESC LIMIT 100").fetchall()
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
