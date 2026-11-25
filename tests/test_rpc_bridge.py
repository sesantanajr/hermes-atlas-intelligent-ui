"""1.1.2: the Atlas API over Hermes plugin RPC, the door Hermes Desktop and the Webapp use on
profiles whose dashboard router refuses user plugins (Hermes 0.23, PLG-3)."""
import pytest

from hermes_atlas.agent import rpc
from hermes_host import HostContext, LegacyHostContext, registered

TRIP = {"title": "Viagem", "blocks": [
    {"type": "checklist", "id": "todo", "title": "Antes de sair", "items": ["Passaporte", "Seguro"]}]}
METHOD = "http"


def test_registers_the_bridge_when_hermes_has_plugin_rpc():
    ctx, _ = registered(HostContext)
    assert list(ctx.rpc_methods) == ["plugin.atlas-intelligent-ui.http"]
    legacy, _ = registered(LegacyHostContext)
    assert not hasattr(legacy, "rpc_methods")  # older Hermes: nothing registered, nothing breaks


def test_the_bridge_answers_like_the_rest_api():
    ctx, _ = registered(HostContext)
    created = ctx.call("atlas_render", {"canvas": TRIP})
    listing = ctx.rpc(METHOD, {"method": "GET", "path": "/canvases"})
    assert listing["status"] == 200 and [row["id"] for row in listing["body"]] == [created["id"]]
    record = ctx.rpc(METHOD, {"method": "GET", "path": f"/canvases/{created['id']}", "query": {"revision": 1}})
    assert record["status"] == 200 and record["body"]["canvas"]["title"] == "Viagem"
    scope = ctx.rpc(METHOD, {"method": "GET", "path": "/status"})["body"]["scope"]
    draft = {**record["body"]["canvas"], "state": {"todo": {"checked": [0], "width": "half"}}}
    saved = ctx.rpc(METHOD, {"method": "PUT", "path": f"/canvases/{created['id']}/draft", "scope": scope,
                             "body": {"canvas": draft, "base_revision": 1}})
    assert saved["status"] == 200
    hint = ctx.fire("pre_llm_call", session_id=ctx.session_id)
    assert hint and "unsaved changes" in hint[0]["context"]
    missing = ctx.rpc(METHOD, {"method": "GET", "path": "/canvases/nope"})
    assert missing["status"] == 404 and missing["body"]["detail"] == "Canvas não encontrado."
    stale = ctx.rpc(METHOD, {"method": "GET", "path": "/canvases", "scope": "0" * 24})
    assert stale["status"] == 409


@pytest.mark.parametrize("params", [
    {"method": "GET", "path": "/../../outside/file"},
    {"method": "GET", "path": "http://example.com/canvases"},
    {"method": "GET", "path": "/admin"},
    {"method": "TRACE", "path": "/canvases"},
    {"method": "GET", "path": "/canvases", "scope": "not hex"},
    {"method": "GET", "path": 42},
    "not an object",
])
def test_the_bridge_refuses_anything_but_the_api(params):
    ctx, _ = registered(HostContext)
    answer = ctx.rpc(METHOD, params) if isinstance(params, dict) else rpc.http(params)
    assert answer["status"] == 400 and answer["body"]["detail"]


def test_a_crash_is_an_answer_not_a_gateway_error(monkeypatch):
    def broken(coroutine):
        coroutine.close()
        raise RuntimeError("boom")

    monkeypatch.setattr(rpc, "_run", broken)
    answer = rpc.http({"method": "GET", "path": "/canvases"})
    assert answer == {"status": 500, "body": {"detail": "Atlas internal error (RuntimeError)."}}


def test_runs_even_when_called_on_a_thread_with_a_running_loop():
    import asyncio

    async def inside():
        return rpc.http({"method": "GET", "path": "/components", "query": {"q": "gantt"}})

    answer = asyncio.run(inside())
    assert answer["status"] == 200 and [m["type"] for m in answer["body"]] == ["gantt"]
