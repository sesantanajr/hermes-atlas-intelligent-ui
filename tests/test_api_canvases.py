"""HTTP routes added in 1.0: client handshake, drafts, deletion, exports and directive artifacts."""
import asyncio
import json
import time
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from hermes_atlas import __version__
from hermes_atlas.render import html as html_export
from hermes_atlas.server import gateway
from hermes_atlas.storage.store import Store

BASE = "/api/plugins/atlas-intelligent-ui"
CAPS = {"object": "hermes.api_server.capabilities", "platform": "hermes-agent", "model": "test-hermes",
        "features": {"run_submission": True, "run_status": True, "run_events_sse": True, "run_stop": True,
                     "runs_idempotency": {"supported": True, "durable": True, "retention_seconds": 86400}}}


def canvas(identifier="plan", title="Plano"):
    return {"id": identifier, "title": title, "blocks": [
        {"id": "todo", "type": "checklist", "title": "Tarefas", "items": ["Um", "Dois"]}]}


@pytest.fixture
def client():
    from hermes_atlas.server.app import app
    with TestClient(app, base_url="http://localhost") as instance:
        yield instance


def test_status_reports_version_exports_and_known_front_ends(client, monkeypatch, tmp_path):
    monkeypatch.setattr(html_export, "TEMPLATE", tmp_path / "absent.html")
    status = client.get(BASE + "/status").json()
    assert status["version"] == __version__ and status["connected"] is False
    assert status["exports"] == {"html": False, "markdown": True, "json": True}
    assert status["clients"] == {"desktop": False, "dashboard": False, "standalone": False}
    hello = client.post(BASE + "/clients/desktop", json={"version": "1.0.0"})
    assert hello.status_code == 200 and hello.json()["atlas"] == __version__ and hello.json()["kind"] == "desktop"
    assert hello.json()["locale"] == "auto"  # nothing chosen: each front end follows its host page
    assert client.get(BASE + "/status").json()["clients"]["desktop"] is True
    assert client.post(BASE + "/clients/toaster", json={}).status_code == 422
    assert Store().client("desktop")["version"] == "1.0.0"
    client.post(BASE + "/clients/desktop", json={"version": "1.0.0", "features": ["tool_media", "tool_media"]})
    assert Store().client("desktop")["features"] == ["tool_media"]
    assert client.post(BASE + "/clients/desktop", json={"features": ["<script>"]}).status_code == 422
    assert client.post(BASE + "/clients/desktop", json={"features": ["a"] * 9}).status_code == 422


def test_draft_keeps_unsaved_interaction_until_a_revision_is_saved(client):
    assert client.post(BASE + "/canvases", json=canvas()).json()["revision"] == 1
    endpoint = BASE + "/canvases/plan/draft"
    assert client.get(endpoint).json() is None
    ticked = {**canvas(), "state": {"todo": {"checked": [1]}}}
    saved = client.put(endpoint, json={"canvas": ticked, "base_revision": 1})
    assert saved.status_code == 200 and saved.json()["base_revision"] == 1 and len(saved.json()["token"]) == 64
    assert client.get(endpoint).json()["canvas"]["state"]["todo"]["checked"] == [1]
    assert client.get(BASE + "/canvases/plan").json()["canvas"].get("state", {}) == {}      # the revision is untouched
    # Compare-and-swap between two tabs: the second writer must present the token it read.
    both = {**canvas(), "state": {"todo": {"checked": [0, 1]}}}
    assert client.put(endpoint, json={"canvas": both, "base_revision": 1, "expected_token": "0" * 64}).status_code == 409
    assert client.put(endpoint, json={"canvas": both, "base_revision": 1, "expected_token": saved.json()["token"]}).status_code == 200
    assert client.put(endpoint, json={"canvas": both, "base_revision": 7}).status_code == 404
    assert client.put(endpoint, json={"canvas": canvas("other"), "base_revision": 1}).status_code == 422
    invalid = {**canvas(), "state": {"todo": {"checked": [99]}}}
    assert client.put(endpoint, json={"canvas": invalid, "base_revision": 1}).status_code == 422
    # Saving a version consumes the draft.
    assert client.post(BASE + "/canvases", json=both, params={"expected_revision": 1}).json()["revision"] == 2
    assert client.get(endpoint).json() is None
    client.put(endpoint, json={"canvas": ticked, "base_revision": 2})
    assert client.delete(endpoint, headers={"Content-Type": "application/json"}).json() == {"discarded": True}
    assert client.get(endpoint).json() is None


def test_delete_removes_every_revision_and_its_traces(client):
    client.post(BASE + "/canvases", json=canvas())
    client.post(BASE + "/canvases", json=canvas(title="Plano B"), params={"expected_revision": 1})
    client.put(BASE + "/canvases/plan/draft", json={"canvas": canvas(), "base_revision": 2})
    Store().link_canvas("plan", 2, session_id="s1")
    Store().put("workspace", "current", {"chat_id": None, "canvas": canvas(), "revision": 2, "theme": "dark"})
    headers = {"Content-Type": "application/json"}
    assert client.delete(BASE + "/canvases/plan", headers=headers).json() == {"deleted": True}
    assert client.get(BASE + "/canvases/plan").status_code == 404 and client.get(BASE + "/canvases").json() == []
    assert client.get(BASE + "/canvases/plan/versions").json() == []
    assert client.delete(BASE + "/canvases/plan", headers=headers).status_code == 404
    store = Store()
    assert store.draft("plan") is None and store.doc("canvas_link", "plan") is None
    workspace = store.doc("workspace", "current")
    assert workspace["canvas"] is None and workspace["revision"] == 0 and workspace["theme"] == "dark"


def test_text_and_exports(client, monkeypatch, tmp_path):
    client.post(BASE + "/canvases", json={**canvas(title='Plano "A" </script>'), "state": {"todo": {"checked": [0]}}})
    text = client.get(BASE + "/canvases/plan/text").json()
    assert text["revision"] == 1 and text["text"].startswith('# Plano "A" </script> (v1)') and "- [x] Um" in text["text"]
    assert "## Tasks" not in client.get(BASE + "/canvases/plan/text", params={"locale": "en"}).json()["text"]
    markdown = client.get(BASE + "/canvases/plan/export", params={"format": "markdown"}).json()
    assert markdown["filename"] == "plan-v1.md" and markdown["media_type"] == "text/markdown" and "- [ ] Dois" in markdown["content"]
    exported = client.get(BASE + "/canvases/plan/export", params={"format": "json"}).json()
    assert json.loads(exported["content"])["canvas"]["state"]["todo"]["checked"] == [0]
    monkeypatch.setattr(html_export, "TEMPLATE", tmp_path / "absent.html")
    assert client.get(BASE + "/canvases/plan/export").status_code == 501
    template = tmp_path / "viewer.html"
    template.write_text('<html lang="__ATLAS_EXPORT_LANG__"><head><title>__ATLAS_EXPORT_TITLE__ · Atlas</title></head><body>'
                        '<script type="application/json" id="atlas-data">__ATLAS_EXPORT_DATA__</script><script>app()</script></body></html>',
                        encoding="utf-8")
    monkeypatch.setattr(html_export, "TEMPLATE", template)
    page = client.get(BASE + "/canvases/plan/export", params={"locale": "en"}).json()
    assert page["filename"] == "plan-v1.html" and page["media_type"] == "text/html"
    assert '<html lang="en">' in page["content"] and "<title>Plano &quot;A&quot; &lt;/script&gt; · Atlas</title>" in page["content"]
    data = page["content"].split('id="atlas-data">')[1].split("</script>")[0]
    assert "</" not in data and json.loads(data)["canvas"]["title"] == 'Plano "A" </script>'
    assert client.get(BASE + "/canvases/missing/export").status_code == 404


def test_export_cannot_be_broken_out_of_by_canvas_content():
    hostile = {"id": "x", "revision": 1, "updated": "now", "canvas": {
        "id": "x", "title": "__ATLAS_EXPORT_DATA__ </title><script>alert(1)</script>",
        "blocks": [{"id": "t", "type": "text", "title": "T", "text": "</script><script>alert(2)</script>  __ATLAS_EXPORT_TITLE__"}]}}
    template = ('<title>__ATLAS_EXPORT_TITLE__</title><script type="application/json" id="d">__ATLAS_EXPORT_DATA__</script>')
    page = html_export.export_html(hostile, template=template)
    assert page.count("<script") == 1 and page.count("</script>") == 1 and "alert(1)" in page  # as escaped text only
    assert "<script>alert" not in page
    data = json.loads(page.split('id="d">')[1].split("</script>")[0])
    assert data["canvas"] == hostile["canvas"]
    with pytest.raises(ValueError):
        html_export.export_html(hostile, template="<title>__ATLAS_EXPORT_TITLE__</title>")


class Hermes:
    def __init__(self, output):
        self.output = output

    def handle(self, request):
        path = request.url.path
        if path.endswith("/capabilities"):
            return httpx.Response(200, json=CAPS)
        if path.endswith("/runs"):
            return httpx.Response(202, json={"run_id": "run_directive", "status": "started"})
        if path.endswith("/events"):
            return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, text=": open\n\n")
        return httpx.Response(200, json={"run_id": "run_directive", "status": "completed", "output": self.output})


@pytest.fixture
def chat(monkeypatch):
    from hermes_atlas.server.app import app
    gateway._capabilities.clear()
    fake = Hermes("")
    transport = httpx.AsyncClient(transport=httpx.MockTransport(fake.handle))
    monkeypatch.setattr(gateway, "client", lambda: transport)
    with TestClient(app, base_url="http://localhost") as browser:
        yield browser, fake
    asyncio.run(transport.aclose())


def finished(browser, run_id):
    for _ in range(150):
        run = browser.get(BASE + "/runs/" + run_id).json()
        if run["status"] in {"completed", "failed", "cancelled", "interrupted"}:
            return run
        time.sleep(0.02)
    raise AssertionError(run)


def test_a_reply_that_points_at_a_saved_canvas_gets_it_as_its_artifact(chat):
    browser, fake = chat
    saved = Store().save(__import__("hermes_atlas.schema.canvas", fromlist=["Canvas"]).Canvas.model_validate(canvas("canvas-tool")))
    fake.output = 'Montei o plano.\n\n::atlas{id="canvas-tool" rev="1"}\n\nMarque o que já fez.'
    body = {"request_id": str(uuid4()), "conversation_id": str(uuid4()), "input": "monte um plano"}
    run = finished(browser, browser.post(BASE + "/runs", json=body).json()["id"])
    assert run["status"] == "completed" and run["text"] == "Montei o plano.\n\nMarque o que já fez."
    assert run["artifact"]["id"] == "canvas-tool" and run["artifact"]["revision"] == saved["revision"]
    message = browser.get(BASE + "/conversations/" + body["conversation_id"]).json()["messages"][-1]
    assert message["artifact"] == {"id": "canvas-tool", "revision": 1} and "::atlas" not in message["content"]


def test_a_directive_for_an_unknown_canvas_stays_visible(chat):
    browser, fake = chat
    fake.output = 'Veja: ::atlas{id="nunca-existiu" rev="1"}'
    body = {"request_id": str(uuid4()), "conversation_id": str(uuid4()), "input": "oi"}
    run = finished(browser, browser.post(BASE + "/runs", json=body).json()["id"])
    assert run.get("artifact") is None and "::atlas{" in run["text"]


def test_a_reply_that_is_only_the_directive_is_delivered_as_the_canvas(chat):
    browser, fake = chat
    Store().save(__import__("hermes_atlas.schema.canvas", fromlist=["Canvas"]).Canvas.model_validate(canvas("canvas-only")))
    fake.output = '::atlas{id="canvas-only"}'
    body = {"request_id": str(uuid4()), "conversation_id": str(uuid4()), "input": "só o canvas"}
    run = finished(browser, browser.post(BASE + "/runs", json=body).json()["id"])
    assert run["text"] == "" and run["artifact"]["id"] == "canvas-only" and run.get("delivery") != "silent"


def test_the_handshake_passes_on_the_language_chosen_in_hermes(client, monkeypatch):
    from hermes_atlas.agent import locale, settings

    monkeypatch.setattr(locale, "hermes_language", lambda: "pt")
    assert client.post(BASE + "/clients/desktop", json={}).json()["locale"] == "pt-BR"
    monkeypatch.setattr(settings, "_from_config_file", lambda key: "en" if key == "locale" else settings.DEFAULTS[key])
    assert client.post(BASE + "/clients/desktop", json={}).json()["locale"] == "en"
