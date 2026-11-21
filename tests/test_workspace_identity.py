import hashlib
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import pytest

from atlas.models import Canvas
from atlas.store import Store


def sample(title="First"):
    return Canvas(id="same", title=title, blocks=[{"type": "text", "id": "note", "title": "Note", "text": title}])


def legacy_store(path, key, *, link_workspace=True):
    path.parent.mkdir(exist_ok=True, parents=True)
    owner = hashlib.sha256((str(path.resolve()) + key).encode()).hexdigest()[:24]
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("CREATE TABLE canvases (id TEXT, revision INTEGER, title TEXT, updated TEXT, payload TEXT, PRIMARY KEY(id,revision))")
        db.execute("CREATE TABLE documents (kind TEXT, id TEXT, owner TEXT, payload TEXT, updated TEXT, PRIMARY KEY(kind,id,owner))")
        for revision in (1, 2):
            db.execute("INSERT INTO canvases VALUES (?,?,?,?,?)", ("same", revision, "First", "now", sample().model_dump_json()))
        # Only the second revision is explicitly linked to this workspace.
        if link_workspace:
            workspace = {"chat_id": None, "canvas": sample().model_dump(mode="json"), "revision": 2}
            db.execute("INSERT INTO documents VALUES ('workspace','current',?,?,'now')", (owner, json.dumps(workspace)))
    return owner


def test_key_rotation_and_concurrent_binding(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path / "shared"))
    monkeypatch.setenv("ATLAS_HERMES_API_KEY", "initial-test-key")
    with ThreadPoolExecutor(max_workers=4) as pool:
        scopes = list(pool.map(lambda _: Store().scope, range(8)))
    assert len(set(scopes)) == 1
    first = Store()
    first.save(sample())
    run = first.reserve("request-id", "chat-id", {"session_id": "atlas-" + first.scope}, "original")
    monkeypatch.setenv("ATLAS_HERMES_API_KEY", "rotated-test-key")
    second = Store()
    assert second.scope == first.scope
    assert second.doc("run", "request-id") == run
    assert second.get("same")["canvas"]["title"] == "First"


def test_shared_data_dir_isolates_profiles_and_gateways(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path / "shared"))
    monkeypatch.setenv("ATLAS_HERMES_URL", "https://gateway.example/v1")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "alice"))
    alice = Store()
    alice.save(sample())
    alice.put("workspace", "current", {"chat_id": "alice"})
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "bob"))
    bob = Store()
    assert bob.scope != alice.scope
    assert bob.list() == [] and bob.versions("same") == [] and bob.get("same", 1) is None
    assert bob.doc("workspace", "current") is None
    assert bob.save(sample("Second"), 0)["revision"] == 1
    assert alice.get("same")["canvas"]["title"] == "First"
    monkeypatch.setenv("ATLAS_HERMES_URL", "https://other.example/v1")
    assert Store().scope not in {alice.scope, bob.scope}
    assert Store().list() == []
    monkeypatch.setenv("ATLAS_HERMES_URL", "https://gateway.example/v1/")
    assert Store().scope == bob.scope


def test_v02_owner_survives_migration_and_key_change(tmp_path, monkeypatch):
    home = tmp_path / "home"
    path = home / "plugin-data" / "hermes-atlas" / "atlas.db"
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("ATLAS_DATA_DIR", raising=False)
    monkeypatch.delenv("ATLAS_HERMES_URL", raising=False)
    monkeypatch.delenv("ATLAS_HERMES_API_KEY", raising=False)
    monkeypatch.setenv("API_SERVER_KEY", "original")
    old = legacy_store(path, "original")
    migrated = Store(path)
    assert migrated.scope == old
    assert migrated.doc("workspace", "current")["revision"] == 2
    assert [r["revision"] for r in migrated.versions("same")] == [2, 1]
    monkeypatch.setenv("API_SERVER_KEY", "renewed")
    assert Store(path).scope == old


@pytest.mark.parametrize(("override_dir", "explicit_gateway", "visible"), [
    (False, False, True),
    (False, True, False),
    (True, False, False),
])
def test_v02_plugin_tool_only_library(tmp_path, monkeypatch, override_dir, explicit_gateway, visible):
    home = tmp_path / "profiles" / "native"
    path = home / "plugin-data" / "hermes-atlas" / "atlas.db"
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("ATLAS_DATA_DIR", raising=False)
    monkeypatch.delenv("ATLAS_HERMES_URL", raising=False)
    if override_dir:
        monkeypatch.setenv("ATLAS_DATA_DIR", str(path.parent))
    if explicit_gateway:
        monkeypatch.setenv("ATLAS_HERMES_URL", "https://other.example/v1")
    legacy_store(path, "", link_workspace=False)
    first = Store(path)
    assert [r["revision"] for r in first.versions("same")] == ([2, 1] if visible else [])
    # Once another endpoint claimed the first binding, a later binding cannot
    # appropriate a historical library lacking any provenance.
    if explicit_gateway:
        monkeypatch.delenv("ATLAS_HERMES_URL")
    else:
        monkeypatch.setenv("ATLAS_HERMES_URL", "https://another.example/v1")
    assert Store(path).list() == []


def test_migration_never_claims_unknown_credentials_or_unlinked_shared_canvases(tmp_path, monkeypatch):
    path = tmp_path / "shared" / "atlas.db"
    old = legacy_store(path, "original")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "other"))
    monkeypatch.delenv("ATLAS_HERMES_URL", raising=False)
    monkeypatch.setenv("ATLAS_HERMES_API_KEY", "different")
    unknown = Store(path)
    assert unknown.scope != old and unknown.doc("workspace", "current") is None
    assert unknown.list() == []
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "owner"))
    monkeypatch.setenv("ATLAS_HERMES_API_KEY", "original")
    matched = Store(path)
    assert matched.scope == old
    assert matched.get("same", 2) and matched.get("same", 1) is None
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "another"))
    assert Store(path).scope != old and Store(path).list() == []
    with closing(sqlite3.connect(path)) as db:
        assert db.execute("SELECT COUNT(*) FROM canvases").fetchone()[0] == 2
