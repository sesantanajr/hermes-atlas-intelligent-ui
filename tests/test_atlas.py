import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.storage.store import Store


def payload():
    return {"schema_version": "1.0", "id": "test", "title": "Test", "blocks": [{"id": "a", "type": "text", "title": "Note", "text": "<script>alert(1)</script>"}]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path))
    from hermes_atlas.server.app import app
    with TestClient(app, base_url="http://localhost") as client:
        yield client


def test_rejects_executable_components():
    item = payload()
    item["blocks"][0]["type"] = "html"
    with pytest.raises(ValueError):
        Canvas.model_validate(item)


def test_rejects_unknown_properties():
    item = payload()
    item["blocks"][0]["onclick"] = "fetch('/secrets')"
    with pytest.raises(ValueError):
        Canvas.model_validate(item)


def test_rejects_duplicate_ids():
    item = payload()
    item["blocks"] *= 2
    with pytest.raises(ValueError):
        Canvas.model_validate(item)


def test_rejects_non_rectangular_table():
    item = payload()
    item["blocks"] = [{"id": "a", "type": "table", "title": "T", "columns": ["A", "B"], "rows": [["one"]]}]
    with pytest.raises(ValueError):
        Canvas.model_validate(item)


def test_revision_concurrency(tmp_path):
    store = Store(tmp_path / "test.db")
    canvas = Canvas.model_validate(payload())
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda _: store.save(canvas), range(10)))
    assert sorted(r["revision"] for r in results) == list(range(1, 11))
    assert store.get("test")["revision"] == 10
    assert store.get("test", 1)["revision"] == 1
    assert len(store.list()) == 1
    assert store.get("unknown") is None


def test_api_roundtrip(client):
    base = "/api/plugins/hermes-atlas"
    assert client.post(base + "/canvases", json=payload()).status_code == 200
    assert client.get(base + "/canvases/test").json()["canvas"]["blocks"][0]["text"].startswith("<script>")
    assert client.get(base + "/canvases/missing").status_code == 404
    assert len(client.get(base + "/canvases").json()) == 1


def test_local_origin_guard(client):
    assert client.post('/api/plugins/hermes-atlas/canvases', json=payload(), headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.post('/api/plugins/hermes-atlas/canvases', content='{}', headers={"Content-Type": "text/plain"}).status_code == 415
    assert client.get('/api/plugins/hermes-atlas/status', headers={"Host": "evil.example"}).status_code == 400


def test_plugin_registers_and_renders():
    from hermes_host import registered

    ctx, _ = registered()
    assert set(ctx.tools) == {"atlas_render", "atlas_update", "atlas_list", "atlas_get", "atlas_components",
                              "atlas_export", "atlas_resources"}
    resources = ctx.call("atlas_resources")
    assert 'observed_at' in resources and 'disk' in resources
    result = ctx.call("atlas_render", {"canvas": payload()})
    assert result["success"] and result["revision"] == 1
    assert not ctx.call("atlas_render", {})["success"]


def load_dashboard_api(name):
    """Import ``dashboard/plugin_api.py`` the way Hermes does (``plugin_isolation.import_user_code``):
    by path, as a top-level module with no package, registered in ``sys.modules`` while it runs."""
    path = Path(__file__).resolve().parents[1] / "dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(name, None)
    return module


def test_dashboard_router_loads_as_hermes_imports_it():
    module = load_dashboard_api("hermes_dashboard_plugin_hermes-atlas")
    paths = {route.path for route in module.router.routes}
    assert {"/status", "/canvases", "/canvases/{id}/draft", "/canvases/{id}/export", "/runs", "/clients/{kind}"} <= paths
    # In this process the package is already imported, so the dashboard reuses that copy.
    assert module._loaded_package() == "hermes_atlas"


def test_dashboard_router_loads_in_a_process_that_never_imported_atlas():
    """The plugin host and a dashboard without the agent half start from nothing: run it in a fresh
    interpreter where neither the package nor the repository is importable by name."""
    import subprocess
    root = Path(__file__).resolve().parents[1]
    code = (
        "import importlib.util, sys\n"
        f"path = {str(root / 'dashboard' / 'plugin_api.py')!r}\n"
        "assert not any(p and __import__('pathlib').Path(p).resolve() == __import__('pathlib').Path(path).parents[1] for p in sys.path)\n"
        "name = 'hermes_dashboard_plugin_hermes-atlas'\n"
        "spec = importlib.util.spec_from_file_location(name, path)\n"
        "module = importlib.util.module_from_spec(spec); sys.modules[name] = module; spec.loader.exec_module(module)\n"
        "private = [n for n in sys.modules if n.startswith('_hermes_atlas_') and '.' not in n]\n"
        "assert len(private) == 1 and 'hermes_atlas' not in sys.modules, private\n"
        "from fastapi import FastAPI\n"
        "from fastapi.testclient import TestClient\n"
        "app = FastAPI(); app.include_router(module.router, prefix='/api/plugins/hermes-atlas')\n"
        "client = TestClient(app)\n"
        "print(client.get('/api/plugins/hermes-atlas/components').status_code, len(module.router.routes))\n")
    done = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, cwd=root.parent, timeout=120)
    assert done.returncode == 0, done.stderr[-2000:]
    status, routes = done.stdout.split()
    assert status == "200" and int(routes) >= 20


def test_remote_http_rejected(client, monkeypatch):
    monkeypatch.setenv("ATLAS_HERMES_URL", "http://remote.example/v1")
    result = client.get('/api/plugins/hermes-atlas/status').json()
    assert not result['connected']
    assert 'HTTPS' in result['detail']
