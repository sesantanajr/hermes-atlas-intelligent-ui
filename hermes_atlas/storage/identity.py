"""Keep the upstream session namespace stable across API key rotations."""
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

from .. import runtime


def _upgrade_canvases(db):
    db.execute("CREATE TABLE IF NOT EXISTS workspace_bindings (identity TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS owned_canvases (
            owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
            title TEXT, updated TEXT, payload TEXT, PRIMARY KEY(owner,id,revision))
    """)
    # Before 0.3 the canvas table lacked an owner. Recover explicit references
    # even in shared directories without attributing unlinked rows to a caller.
    db.execute("""
        WITH refs(owner,id,revision) AS (
            SELECT owner, json_extract(payload,'$.id'), json_extract(payload,'$.revision')
              FROM documents WHERE kind='artifact_run'
            UNION
            SELECT owner, json_extract(payload,'$.canvas.id'), json_extract(payload,'$.revision')
              FROM documents WHERE kind='workspace'
            UNION
            SELECT d.owner, json_extract(m.value,'$.artifact.id'), json_extract(m.value,'$.artifact.revision')
              FROM documents d, json_each(d.payload,'$.messages') m
             WHERE d.kind='conversation' AND json_type(m.value,'$.artifact')='object'
        )
        INSERT OR IGNORE INTO owned_canvases
        SELECT refs.owner,c.id,c.revision,c.title,c.updated,c.payload
          FROM canvases c JOIN refs ON c.id=refs.id AND c.revision=refs.revision
    """)
    db.execute("PRAGMA user_version=2")


def bind_workspace(db, path):
    home = runtime.profile_home()
    profile = os.path.normcase(str(home.resolve()))
    identity = hashlib.sha256(json.dumps([profile, runtime.gateway_url(home)]).encode()).hexdigest()
    if db.execute("PRAGMA user_version").fetchone()[0] >= 2:
        found = db.execute("SELECT owner FROM workspace_bindings WHERE identity=?", (identity,)).fetchone()
        if found:
            return found[0]

    db.execute("BEGIN IMMEDIATE")
    if db.execute("PRAGMA user_version").fetchone()[0] < 2:
        _upgrade_canvases(db)
    found = db.execute("SELECT owner FROM workspace_bindings WHERE identity=?", (identity,)).fetchone()
    if found:
        return found[0]

    # Reuse the *exact* v0.2 owner for an existing namespace: it is part of
    # Hermes's session_id and Idempotency-Key as well as the local history.
    resolved = Path(path).resolve()
    legacy = str(resolved) + runtime.setting('ATLAS_HERMES_URL')
    legacy += runtime.setting('ATLAS_HERMES_API_KEY') or runtime.setting('API_SERVER_KEY')
    old_owner = hashlib.sha256(legacy.encode()).hexdigest()[:24]
    can_adopt = db.execute("""
        SELECT 1 FROM documents WHERE owner=?
          AND NOT EXISTS (SELECT 1 FROM workspace_bindings WHERE owner=?) LIMIT 1
    """, (old_owner, old_owner)).fetchone()
    owner = old_owner if can_adopt else uuid4().hex[:24]
    db.execute("INSERT INTO workspace_bindings VALUES (?,?)", (identity, owner))
    private_path = not os.environ.get('ATLAS_DATA_DIR') and resolved == (
        home / 'plugin-data' / 'hermes-atlas' / 'atlas.db'
    ).resolve()
    if private_path and (can_adopt or not runtime.setting('ATLAS_HERMES_URL')):
        # A v0.2 installation used exclusively through atlas_render contains
        # canvases but no documents at all. Only its first default local
        # binding may inherit those revisions. An unknown old owner vetoes it.
        db.execute("""
            INSERT OR IGNORE INTO owned_canvases
            SELECT ?, c.* FROM canvases c
             WHERE NOT EXISTS (SELECT 1 FROM documents WHERE owner<>?)
               AND NOT EXISTS (SELECT 1 FROM workspace_bindings WHERE owner<>?)
        """, (owner, owner, owner))
    return owner
