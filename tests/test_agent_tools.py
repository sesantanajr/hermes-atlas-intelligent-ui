"""What the agent can do with Atlas, driven through the host double the way Hermes drives it."""
import importlib
import json
from pathlib import Path

import pytest

from hermes_atlas import directive
from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.storage.store import Store
from hermes_host import HostContext, module_name_for, registered

TRIP = {"title": "Viagem a Lisboa", "description": "Exemplo.", "blocks": [
    {"type": "checklist", "id": "todo", "title": "Antes de sair", "items": ["Passaporte", "Seguro"]},
    {"type": "metric", "id": "cost", "title": "Custo", "value": "R$ 4.200", "detail": "duas pessoas"},
]}


def host(surface="", **kwargs):
    ctx, _ = registered(HostContext, surface=surface, **kwargs)
    return ctx


def test_components_overview_then_schema_then_search():
    ctx = host()
    overview = ctx.call("atlas_components")
    assert overview["success"] and overview["count"] == 73 and len(overview["categories"]) == 8
    types = {name for group in overview["categories"] for name in group["types"]}
    assert len(types) == 73 and overview["categories"][4]["category"] == "data"
    assert overview["categories"][0]["types"]["text"].startswith("A plain paragraph")
    detail = ctx.call("atlas_components", {"types": ["series", "budget_planner", "nope"]})
    assert [b["type"] for b in detail["blocks"]] == ["series", "budget_planner"] and detail["unknown"] == ["nope"]
    for block in detail["blocks"]:
        assert block["schema"]["properties"]["type"]["const"] == block["type"]
        Canvas.model_validate({"id": "x", "title": "x", "blocks": [block["example"]]})
    assert ctx.call("atlas_components", {"type": "quiz"})["blocks"][0]["purpose"]
    assert [m["type"] for m in ctx.call("atlas_components", {"q": "timeline"})["matches"]] == ["timeline"]
    assert [m["type"] for m in ctx.call("atlas_components", {"q": "linha do tempo"})["matches"]] == ["timeline"]
    forms = ctx.call("atlas_components", {"category": "forms"})["matches"]
    assert len(forms) == 8 and all(m["category"] == "Forms" for m in forms)


def test_render_saves_a_new_canvas_and_links_it_to_the_conversation():
    ctx = host()
    result = ctx.call("atlas_render", {"canvas": {**TRIP, "id": "the-model-chose-this"}})
    assert result["success"] and result["status"] == "created" and result["revision"] == 1 and result["blocks"] == 2
    assert result["id"].startswith("canvas-") and result["id"] != "the-model-chose-this"
    assert result["directive"] == directive.directive(result["id"], 1) == f'::atlas{{id="{result["id"]}" rev="1"}}'
    store = Store()
    assert store.get(result["id"])["canvas"]["title"] == "Viagem a Lisboa"
    link = store.doc("canvas_link", result["id"])
    assert link["agent_revision"] == 1 and link["session_id"] == ctx.session_id
    assert ctx.session_events == [(ctx.session_id, "canvas.saved", {"id": result["id"], "revision": 1, "title": "Viagem a Lisboa"})]


def test_validation_errors_name_the_block_and_the_field():
    ctx = host()
    broken = {"canvas": {"title": "T", "blocks": [
        {"type": "table", "id": "t", "title": "Tabela", "columns": ["A", "B"], "rows": [["só um"]]},
        {"type": "hologram", "id": "h", "title": "Não existe"},
        {"type": "metric", "id": "m", "title": "M", "value": "1", "onclick": "alert(1)"}]}}
    error = ctx.call("atlas_render", broken)["error"]
    assert "blocks[0].table" in error and "column count" in error
    assert "blocks[1]: unknown block type 'hologram'" in error
    assert "blocks[2].metric.onclick: this field does not exist" in error
    assert Store().list() == []


MEDIA_DESKTOP = {"version": "1.0.0", "features": ["tool_media"]}
OLDER_DESKTOP = {"version": "1.0.0", "features": []}


@pytest.mark.parametrize("surface, desktop, style, expected", [
    ("desktop", MEDIA_DESKTOP, "auto", "file"),       # the extension draws the file as the live canvas
    ("desktop", OLDER_DESKTOP, "auto", "directive"),  # the extension on a Desktop without media renderers
    ("desktop", None, "auto", "file"),                # no extension: a file card that previews the page
    ("telegram", MEDIA_DESKTOP, "auto", "text"), ("cli", OLDER_DESKTOP, "auto", "text"), ("tui", None, "auto", "text"),
    ("", None, "auto", "either"), ("local", None, "auto", "either"),
    ("telegram", None, "directive", "directive"), ("desktop", MEDIA_DESKTOP, "text", "text"),
    ("telegram", None, "file", "file"),
])
def test_presentation_follows_the_surface(surface, desktop, style, expected):
    ctx = host(surface, settings={"reply_style": style})
    if desktop is not None:
        Store().touch_client("desktop", desktop)
    result = ctx.call("atlas_render", {"canvas": TRIP})
    assert result["show"] == expected and result["surface"] == (surface or "unknown")
    if expected == "file":
        page = Path(result["file"])
        assert page.is_file() and page.suffix == ".html" and "Viagem a Lisboa" in page.read_text(encoding="utf-8")
        assert result["media"] == "MEDIA:" + result["file"] and result["media"] in result["present"]
    else:
        assert "file" not in result and "media" not in result
    if expected == "directive":
        assert result["directive"] in result["present"] and "by itself" in result["present"]
    if expected == "text":
        assert "cannot draw canvases" in result["present"] and "atlas_export" in result["present"]


def test_without_the_export_viewer_the_file_style_falls_back(isolated_hermes_home, monkeypatch):
    ctx = host("desktop")
    # The plugin's own copy of the module, as Hermes imported it.
    html_module = importlib.import_module(module_name_for("hermes-atlas") + ".hermes_atlas.render.html")
    monkeypatch.setattr(html_module, "TEMPLATE", isolated_hermes_home / "absent.html")
    assert ctx.call("atlas_render", {"canvas": TRIP})["show"] == "text"
    Store().touch_client("desktop", MEDIA_DESKTOP)
    assert ctx.call("atlas_render", {"canvas": TRIP})["show"] == "directive"


def test_an_update_ships_the_new_revision_as_its_own_file():
    ctx = host("desktop")
    first = ctx.call("atlas_render", {"canvas": TRIP})
    second = ctx.call("atlas_update", {"id": first["id"], "expected_revision": 1, "operations": [
        {"op": "set", "field": "title", "text": "Viagem ao Porto"}]})
    assert second["show"] == "file" and second["file"] != first["file"]
    assert "Viagem ao Porto" in Path(second["file"]).read_text(encoding="utf-8")
    assert Path(first["file"]).is_file()  # the earlier reply still names a file that exists


def test_the_atlas_chat_always_gets_the_directive():
    ctx = host("api_server")
    assert ctx.call("atlas_render", {"canvas": TRIP})["show"] == "text"  # some other API client
    chat_session = "atlas-" + Store().scope + "-2d6f"
    assert ctx.call("atlas_render", {"canvas": TRIP}, session_id=chat_session)["show"] == "directive"
    forced = host("api_server", settings={"reply_style": "file"})
    assert forced.call("atlas_render", {"canvas": TRIP}, session_id=chat_session)["show"] == "directive"


def test_update_edits_blocks_without_resending_the_canvas():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    result = ctx.call("atlas_update", {"id": created["id"], "expected_revision": 1, "operations": [
        {"op": "add_block", "before": "cost", "block": {"type": "text", "id": "note", "title": "Nota", "text": "Leve adaptador."}},
        {"op": "replace_block", "block": {"type": "metric", "id": "cost", "title": "Custo", "value": "R$ 3.900"}},
        {"op": "set_state", "id": "todo", "state": {"checked": [0]}},
        {"op": "set", "field": "title", "text": "Lisboa em maio"},
        {"op": "set_sources", "sources": [{"title": "Guia", "url": "https://example.org/"}]},
        {"op": "move_block", "id": "todo"},
    ]})
    assert result["success"] and result["revision"] == 2 and result["status"] == "updated" and result["blocks"] == 3
    canvas = Store().get(created["id"])["canvas"]
    assert [b["id"] for b in canvas["blocks"]] == ["note", "cost", "todo"]
    assert canvas["title"] == "Lisboa em maio" and canvas["blocks"][1]["value"] == "R$ 3.900"
    assert canvas["state"]["todo"]["checked"] == [0] and canvas["sources"][0]["title"] == "Guia"
    assert Store().get(created["id"], 1)["canvas"]["title"] == "Viagem a Lisboa"  # revisions are immutable


def test_update_refuses_a_stale_revision_and_bad_operations():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    Store().save(Canvas.model_validate({**TRIP, "id": created["id"], "title": "Editado pela pessoa"}), 1)
    stale = ctx.call("atlas_update", {"id": created["id"], "expected_revision": 1,
                                      "operations": [{"op": "remove_block", "id": "cost"}]})
    assert not stale["success"] and "now at revision 2" in stale["error"] and "atlas_get" in stale["error"]
    for operations, message in [
        ([{"op": "remove_block", "id": "ghost"}], "no block with id 'ghost'"),
        ([{"op": "add_block", "block": {"type": "text", "id": "todo", "title": "x", "text": "x"}}], "already exists"),
        ([{"op": "teleport"}], "unknown op 'teleport'"),
        ([{"op": "remove_block", "id": "todo"}, {"op": "remove_block", "id": "cost"}], "at least one block"),
        ([{"op": "replace_block", "block": {"type": "metric", "id": "cost", "title": "C"}}], "required field is missing"),
    ]:
        refused = ctx.call("atlas_update", {"id": created["id"], "expected_revision": 2, "operations": operations})
        assert not refused["success"] and message in refused["error"], refused
    assert Store().get(created["id"])["revision"] == 2


def test_replacing_a_block_with_another_type_drops_its_state():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": {**TRIP, "state": {"todo": {"checked": [1]}}}})
    result = ctx.call("atlas_update", {"id": created["id"], "expected_revision": 1, "operations": [
        {"op": "replace_block", "block": {"type": "text", "id": "todo", "title": "Feito", "text": "Tudo pronto."}}]})
    assert result["success"] and "todo" not in Store().get(created["id"])["canvas"]["state"]


def test_get_views_and_the_users_live_state():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    full = ctx.call("atlas_get", {"id": created["id"]})
    assert full["canvas"]["blocks"][0]["items"] == ["Passaporte", "Seguro"] and "unsaved_user_changes" not in full
    assert ctx.call("atlas_get", {"id": created["id"], "view": "outline"})["blocks"] == [
        {"id": "todo", "type": "checklist", "title": "Antes de sair"}, {"id": "cost", "type": "metric", "title": "Custo"}]
    text = ctx.call("atlas_get", {"id": created["id"], "view": "text"})["text"]
    assert "- [ ] Passaporte" in text and "canvas" not in ctx.call("atlas_get", {"id": created["id"], "view": "text"})
    partial = ctx.call("atlas_get", {"id": created["id"], "blocks": ["cost"]})
    assert partial["partial"] and [b["id"] for b in partial["canvas"]["blocks"]] == ["cost"]
    # The user ticks an item in an inline canvas: the draft is what the agent reads next.
    store = Store()
    edited = Canvas.model_validate({**store.get(created["id"])["canvas"], "state": {"todo": {"checked": [0]}}})
    store.save_draft(edited, 1)
    live = ctx.call("atlas_get", {"id": created["id"]})
    assert live["canvas"]["state"]["todo"]["checked"] == [0] and live["unsaved_user_changes"] and live["revision"] == 1
    assert "state" not in ctx.call("atlas_get", {"id": created["id"], "revision": 1})["canvas"] or \
        not ctx.call("atlas_get", {"id": created["id"], "revision": 1})["canvas"]["state"]


def test_get_reads_unsaved_state_from_the_atlas_workspace_too():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    store = Store()
    canvas = {**store.get(created["id"])["canvas"], "state": {"todo": {"checked": [1]}}}
    store.put("workspace", "current", {"chat_id": None, "canvas": canvas, "revision": 1, "theme": "system"})
    live = ctx.call("atlas_get", {"id": created["id"]})
    assert live["canvas"]["state"]["todo"]["checked"] == [1] and live["unsaved_user_changes"]


def test_a_very_large_canvas_comes_back_as_an_outline():
    ctx = host()
    blocks = [{"type": "text", "id": f"b{i}", "title": f"Parte {i}", "text": "palavra " * 1400} for i in range(8)]
    created = ctx.call("atlas_render", {"canvas": {"title": "Grande", "blocks": blocks}})
    result = ctx.call("atlas_get", {"id": created["id"]})
    assert result["too_large"] and len(result["blocks"]) == 8 and "canvas" not in result
    assert ctx.call("atlas_get", {"id": created["id"], "blocks": ["b3"]})["canvas"]["blocks"][0]["id"] == "b3"


def test_a_canvas_over_the_size_limit_is_refused_with_advice_for_the_model():
    ctx = host()
    blocks = [{"type": "text", "id": f"b{i}", "title": f"Parte {i}", "text": "palavra " * 1500} for i in range(25)]
    result = ctx.call("atlas_render", {"canvas": {"title": "Enorme", "blocks": blocks}})
    assert result["success"] is False
    assert "limit is 256 KB" in result["error"] and "split it" in result["error"]
    assert ctx.call("atlas_list")["canvases"] == []


def test_list_searches_titles():
    ctx = host()
    ctx.call("atlas_render", {"canvas": TRIP})
    ctx.call("atlas_render", {"canvas": {**TRIP, "title": "Orçamento do mês"}})
    assert [c["title"] for c in ctx.call("atlas_list")["canvases"]] == ["Orçamento do mês", "Viagem a Lisboa"]
    assert [c["title"] for c in ctx.call("atlas_list", {"q": "LISBOA"})["canvases"]] == ["Viagem a Lisboa"]
    assert ctx.call("atlas_list", {"limit": 1})["more"] is True


def test_export_writes_files_under_the_data_directory(isolated_hermes_home, monkeypatch):
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": {**TRIP, "title": 'Relatório </script> "ação"'}})
    exports = isolated_hermes_home / "plugin-data" / "hermes-atlas" / "exports"
    markdown = ctx.call("atlas_export", {"id": created["id"], "format": "markdown"})
    assert markdown["success"] and markdown["path"].endswith("-v1.md") and markdown["media"] == "MEDIA:" + markdown["path"]
    assert exports in __import__("pathlib").Path(markdown["path"]).parents
    assert "- [ ] Passaporte" in open(markdown["path"], encoding="utf-8").read()
    exported = json.load(open(ctx.call("atlas_export", {"id": created["id"], "format": "json"})["path"], encoding="utf-8"))
    assert exported["canvas"]["blocks"][1]["value"] == "R$ 4.200" and exported["revision"] == 1
    # The viewer template is a build artefact; without it the tool explains instead of failing.
    html_module = importlib.import_module(module_name_for("hermes-atlas") + ".hermes_atlas.render.html")
    monkeypatch.setattr(html_module, "TEMPLATE", isolated_hermes_home / "absent.html")
    missing = ctx.call("atlas_export", {"id": created["id"]})
    assert not missing["success"] and "markdown" in missing["error"]
    template = isolated_hermes_home / "viewer.html"
    template.write_text('<html lang="__ATLAS_EXPORT_LANG__"><title>__ATLAS_EXPORT_TITLE__</title>'
                        '<script type="application/json" id="atlas-data">__ATLAS_EXPORT_DATA__</script></html>', encoding="utf-8")
    monkeypatch.setattr(html_module, "TEMPLATE", template)
    page = open(ctx.call("atlas_export", {"id": created["id"], "format": "html"})["path"], encoding="utf-8").read()
    assert "<title>Relatório &lt;/script&gt; &quot;ação&quot;</title>" in page
    payload = page.split('id="atlas-data">')[1].split("</script>")[0]
    assert "<" not in payload and json.loads(payload)["canvas"]["title"] == 'Relatório </script> "ação"'


def test_resources_reports_the_host():
    result = host().call("atlas_resources")
    assert result["success"] and "disk" in result and result["logical_cpus"]


def test_the_agent_is_told_once_when_the_user_changes_its_canvas():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    turn = dict(session_id=ctx.session_id, user_message="e agora?", conversation_history=[], is_first_turn=False,
                model="m", platform="desktop")
    assert ctx.fire("pre_llm_call", **turn) == []                      # nothing changed yet
    store = Store()
    store.save(Canvas.model_validate({**store.get(created["id"])["canvas"], "title": "Lisboa (minha versão)"}), 1)
    note, = ctx.fire("pre_llm_call", **turn)
    assert "[Atlas]" in note["context"] and created["id"] in note["context"]
    assert "saved revision 2 (you last wrote revision 1)" in note["context"] and "atlas_get" in note["context"]
    assert ctx.fire("pre_llm_call", **turn) == []                      # announced once
    assert ctx.fire("pre_llm_call", **{**turn, "session_id": "another-session"}) == []
    # Unsaved interaction is announced too, and reading the canvas counts as having seen it.
    store.save_draft(Canvas.model_validate({**store.get(created["id"])["canvas"], "state": {"todo": {"checked": [1]}}}), 2)
    assert "unsaved changes" in ctx.fire("pre_llm_call", **turn)[0]["context"]
    store.save_draft(Canvas.model_validate({**store.get(created["id"])["canvas"], "state": {"todo": {"checked": [0, 1]}}}), 2)
    ctx.call("atlas_get", {"id": created["id"]})
    assert ctx.fire("pre_llm_call", **turn) == []


def test_the_agents_own_update_is_not_reported_back_to_it():
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    ctx.call("atlas_update", {"id": created["id"], "expected_revision": 1,
                              "operations": [{"op": "set", "field": "title", "text": "Novo título"}]})
    assert ctx.fire("pre_llm_call", session_id=ctx.session_id) == []


def test_context_hints_can_be_switched_off_and_cost_nothing_before_first_use(isolated_hermes_home):
    quiet = host(settings={"context_hints": False})
    created = quiet.call("atlas_render", {"canvas": TRIP})
    store = Store()
    store.save(Canvas.model_validate({**store.get(created["id"])["canvas"], "title": "Outra"}), 1)
    assert quiet.fire("pre_llm_call", session_id=quiet.session_id) == []


def test_the_hook_does_not_create_a_library_for_people_who_never_used_atlas(isolated_hermes_home):
    fresh = host()
    assert fresh.fire("pre_llm_call", session_id="s1", user_message="oi") == []
    assert not (isolated_hermes_home / "plugin-data").exists()


def test_slash_command_gives_text_everywhere(isolated_hermes_home):
    ctx = host(settings={"locale": "pt-BR"})
    assert "A biblioteca está vazia" in ctx.slash("atlas")
    created = ctx.call("atlas_render", {"canvas": {**TRIP, "blocks": TRIP["blocks"] + [
        {"type": "table", "id": "t", "title": "Preços", "columns": ["Item", "Valor"], "rows": [["Voo", "R$ 2.800"]]}]}})
    status = ctx.slash("atlas", "", platform="cli")
    assert "Hermes Atlas 1.0.0" in status and "1 canvas(es)" in status and created["id"] in status
    assert "Viagem a Lisboa" in ctx.slash("atlas", "list lisboa")
    assert "Nenhum canvas encontrado" in ctx.slash("atlas", "list marte")
    desktop = ctx.slash("atlas", "show " + created["id"], platform="desktop")
    assert desktop.startswith("# Viagem a Lisboa (v1)") and "| Item | Valor |" in desktop
    telegram = ctx.slash("atlas", "show lisboa", platform="telegram")       # by title, on a platform without tables
    assert "|" not in telegram and "- Voo · Valor: R$ 2.800" in telegram
    assert "Não encontrei" in ctx.slash("atlas", "show nada-disso")
    exported = ctx.slash("atlas", f"export {created['id']} md")
    assert "Arquivo gerado:" in exported and "MEDIA:" in exported and exported.strip().endswith(".md")
    assert ctx.slash("atlas", "help").startswith("Uso:")
    english = host(settings={"locale": "en"})
    assert "Library: 1 canvas(es)" in english.slash("atlas") and english.slash("atlas", "help").startswith("Usage:")


def test_terminal_commands(capsys, isolated_hermes_home):
    from hermes_atlas.agent import cli
    ctx = host()
    created = ctx.call("atlas_render", {"canvas": TRIP})
    assert cli.main(["status"]) == 0 and created["id"] in capsys.readouterr().out
    assert cli.main(["list", "lisboa"]) == 0 and "Viagem a Lisboa" in capsys.readouterr().out
    assert cli.main(["show", created["id"]]) == 0 and "- [ ] Passaporte" in capsys.readouterr().out
    target = isolated_hermes_home / "saida" / "viagem.json"
    assert cli.main(["export", created["id"], "--format", "json", "-o", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["canvas"]["title"] == "Viagem a Lisboa"
    assert cli.main(["export", "inexistente"]) == 1
    capsys.readouterr()
    code = cli.main(["doctor", "--json"])
    report = json.loads(capsys.readouterr().out)
    names = {check["name"]: check["status"] for check in report["checks"]}
    assert names["block catalogue"] == "ok" and names["declared tools"] == "ok" and names["versions"] == "ok"
    assert names["library"] == "ok" and names["python libraries"] == "ok"
    assert code == (0 if report["ok"] else 1)


def test_directive_grammar_matches_the_desktop_parser():
    text = 'Pronto.\n\n::atlas{id="canvas-9f" rev="3"}\n\nVeja ::atlas{rev=\'2\' id=\'b_2\'} e std::atlas{id="no"} e ::atlas{id="bad id"}'
    found = directive.find(text)
    assert [(f["id"], f["revision"]) for f in found] == [("canvas-9f", 3), ("b_2", 2)]
    assert directive.strip(text, found[:1]).startswith("Pronto.\n\nVeja")
    assert directive.find("::atlas{id=\"x\"}")[0]["revision"] is None
    assert directive.find("::atlasx{id=\"x\"}") == [] and directive.find("") == []
