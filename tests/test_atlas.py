import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from atlas.models import Canvas
from atlas.store import Store


def payload():
    return {"schema_version": "1.0", "id": "test", "title": "Test", "blocks": [{"id": "a", "type": "text", "title": "Note", "text": "<script>alert(1)</script>"}]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path))
    from atlas.server import app
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


def test_plugin_registers_and_renders(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path))
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("atlas_plugin_test", root / "__init__.py", submodule_search_locations=[str(root)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    class Context:
        def __init__(self): self.tools = {}
        def register_tool(self, **kwargs): self.tools[kwargs["name"]] = kwargs
    ctx = Context()
    module.register(ctx)
    assert set(ctx.tools) == {"atlas_render", "atlas_list"}
    result = json.loads(ctx.tools["atlas_render"]["handler"]({"canvas": payload()}))
    assert result["success"] and result["revision"] == 1
    assert not json.loads(ctx.tools["atlas_render"]["handler"]({}))["success"]


def test_dashboard_router_loads():
    path = Path(__file__).resolve().parents[1] / "dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location("atlas_dashboard_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert any(route.path == "/chat" for route in module.router.routes)


def test_chat_proxy_and_canvas(client, monkeypatch):
    import httpx
    import atlas.api as api
    real_client = httpx.AsyncClient
    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "hermes-agent"
        assert body["messages"][0]["role"] == "system"
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "Aqui está.\n```atlas\n" + json.dumps(payload()) + "\n```"}}]})
    monkeypatch.setattr(api.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    response = client.post('/api/plugins/hermes-atlas/chat', json={"messages": [{"role": "user", "content": "Create a canvas"}]})
    assert response.status_code == 200
    assert response.json()["artifact"]["id"] == "test"
    assert response.json()["text"] == "Aqui está."


@pytest.mark.parametrize("finish", ["error", "cancelled"])
def test_upstream_failure_is_not_success(client, monkeypatch, finish):
    import httpx
    import atlas.api as api
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"choices": [{"finish_reason": finish, "message": {"content": "failed"}}]}))
    monkeypatch.setattr(api.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport, **kwargs))
    response = client.post('/api/plugins/hermes-atlas/chat', json={"messages": [{"role": "user", "content": "Hi"}]})
    assert response.status_code == 502


def test_remote_http_rejected(client, monkeypatch):
    monkeypatch.setenv("ATLAS_HERMES_URL", "http://remote.example/v1")
    assert client.get('/api/plugins/hermes-atlas/status').status_code == 503
