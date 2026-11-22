"""1.1 renamed the plugin from ``hermes-atlas`` to ``atlas-intelligent-ui``. Hermes keeps
``plugin-data/`` when a plugin is removed and refuses to update an install whose name changed,
so Atlas itself carries the library and settings over and reports what the earlier install left."""
import importlib
import json
import logging
import os
import sys
import time
import types

import pytest

from hermes_atlas import LEGACY_PLUGIN_NAMES, PLUGIN_NAME, doctor, events, runtime
from hermes_atlas.agent import settings as settings_module
from hermes_atlas.agent.plugin import _flat_frontmatter, skill_frontmatter, warn_about_earlier_install
from hermes_atlas.storage import migration
from hermes_atlas.storage.store import Store

from hermes_host import HostContext, module_name_for, registered

TRIP = {"title": "Viagem a Lisboa", "blocks": [{"type": "checklist", "id": "todo", "title": "Antes de ir",
                                                 "items": ["Passaporte", "Seguro"]}]}


def plugin_data(home):
    return home / "plugin-data"


@pytest.fixture
def default_location(monkeypatch):
    """Use the library location Hermes gives the plugin, not the explicit test folder."""
    monkeypatch.delenv("ATLAS_DATA_DIR", raising=False)


@pytest.fixture
def hermes_config(monkeypatch):
    """A stand-in for Hermes's read-only config view (``hermes_cli.config.load_config_readonly``)."""
    config = {}
    package = types.ModuleType("hermes_cli")
    module = types.ModuleType("hermes_cli.config")
    module.load_config_readonly = lambda: config
    package.config = module
    monkeypatch.setitem(sys.modules, "hermes_cli", package)
    monkeypatch.setitem(sys.modules, "hermes_cli.config", module)
    return config


def earlier_library(isolated_hermes_home, monkeypatch):
    """A 1.0 library with one canvas, made by the agent tools while the data folder was hermes-atlas."""
    legacy = plugin_data(isolated_hermes_home) / "hermes-atlas"
    monkeypatch.setenv("ATLAS_DATA_DIR", str(legacy))
    ctx, _ = registered(HostContext)
    created = ctx.call("atlas_render", {"canvas": TRIP})
    monkeypatch.delenv("ATLAS_DATA_DIR")
    return legacy, created


def test_the_plugin_id_is_the_same_everywhere():
    assert PLUGIN_NAME == "atlas-intelligent-ui" and LEGACY_PLUGIN_NAMES == ("hermes-atlas",)
    root = doctor.ROOT
    assert doctor.manifest_field((root / "plugin.yaml").read_text(encoding="utf-8"), "name") == PLUGIN_NAME
    assert json.loads((root / "dashboard" / "manifest.json").read_text(encoding="utf-8"))["name"] == PLUGIN_NAME


def test_the_earlier_library_is_copied_on_first_use(isolated_hermes_home, monkeypatch):
    legacy, created = earlier_library(isolated_hermes_home, monkeypatch)
    before = (legacy / "atlas.db").read_bytes()
    # Before anything opens it, read-only callers (the per-turn hook, the doctor) see the 1.0 library.
    assert runtime.database_path(create=False) == legacy / "atlas.db"
    status, _, detail = doctor.check_store()
    assert status == doctor.OK and "1 canvases" in detail and f"copied to plugin-data/{PLUGIN_NAME}" in detail
    ctx, _ = registered(HostContext)
    listed = ctx.call("atlas_list")["canvases"]
    assert [row["id"] for row in listed] == [created["id"]]
    current = plugin_data(isolated_hermes_home) / PLUGIN_NAME
    assert runtime.database_path(create=False) == current / "atlas.db"
    marker = migration.read_marker(current)
    assert marker["from"] == str(legacy) and "error" not in marker
    assert (legacy / "atlas.db").read_bytes() == before, "the earlier library is never changed or removed"
    assert not (current / migration.LOCK).exists()


def test_an_existing_library_is_never_overwritten(isolated_hermes_home, monkeypatch, default_location):
    earlier_library(isolated_hermes_home, monkeypatch)
    current = plugin_data(isolated_hermes_home) / PLUGIN_NAME
    current.mkdir(parents=True)
    Store(path=current / "atlas.db")
    ctx, _ = registered(HostContext)
    assert ctx.call("atlas_list")["canvases"] == []
    assert migration.read_marker(current) == {}


def test_an_unreadable_earlier_library_starts_empty_and_is_reported(isolated_hermes_home, default_location):
    legacy = plugin_data(isolated_hermes_home) / "hermes-atlas"
    legacy.mkdir(parents=True)
    (legacy / "atlas.db").write_bytes(b"this is not a database" * 100)
    ctx, _ = registered(HostContext)
    assert ctx.call("atlas_list")["canvases"] == []
    current = plugin_data(isolated_hermes_home) / PLUGIN_NAME
    assert "error" in migration.read_marker(current)
    assert any("failed" in finding and "still there" in finding for finding in doctor.legacy_findings())


def test_a_lock_left_by_a_crashed_copy_does_not_block_forever(isolated_hermes_home, monkeypatch):
    legacy, created = earlier_library(isolated_hermes_home, monkeypatch)
    current = plugin_data(isolated_hermes_home) / PLUGIN_NAME
    current.mkdir(parents=True)
    lock = current / migration.LOCK
    lock.write_text("", encoding="utf-8")
    old = time.time() - migration.STALE_LOCK_SECONDS - 5
    os.utime(lock, (old, old))
    assert migration.adopt_legacy_library(current) == legacy / "atlas.db"
    assert (current / "atlas.db").is_file() and not lock.exists()


def test_settings_of_the_earlier_entry_apply_and_are_copied_once(hermes_config, monkeypatch):
    monkeypatch.setattr(settings_module, "_carried", set())
    hermes_config["plugins"] = {"entries": {"hermes-atlas": {"settings": {"reply_style": "text", "locale": "en"}}}}
    ctx = HostContext()
    reader = settings_module.Settings(ctx)
    assert reader.reply_style == "text" and reader.reply_style == "text"
    assert reader.context_hints is True     # not set anywhere: the default
    assert ctx.config_writes == [("reply_style", "text")], "copied once, under the new name"
    ctx.settings["locale"] = "pt-BR"          # the new entry wins over the earlier one
    assert reader.locale == "pt-BR" and ("locale", "en") not in ctx.config_writes


def test_dashboard_routes_read_the_earlier_entry_too(hermes_config):
    hermes_config["plugins"] = {"entries": {"hermes-atlas": {"settings": {"resources_tool": False}},
                                            PLUGIN_NAME: {"settings": {"reply_style": "directive"}}}}
    reader = settings_module.Settings()
    assert reader.resources_tool is False and reader.reply_style == "directive"


def run_cli(ctx, *words):
    import argparse
    entry = ctx.cli_commands["atlas"]
    parser = argparse.ArgumentParser(prog="hermes atlas")
    entry["setup_fn"](parser)
    try:
        entry["handler_fn"](parser.parse_args(list(words)))
    except SystemExit as exit_:
        return exit_.code
    return 0


def test_hermes_atlas_migrate_copies_library_and_settings_now(isolated_hermes_home, monkeypatch, hermes_config,
                                                              capsys):
    legacy, created = earlier_library(isolated_hermes_home, monkeypatch)
    hermes_config["plugins"] = {"entries": {"hermes-atlas": {"settings": {"reply_style": "text"}}}}
    ctx, _ = registered(HostContext, settings={"locale": "en"})
    assert run_cli(ctx, "migrate") == 0
    out = capsys.readouterr().out
    assert f"copied from {legacy}" in out and "1 canvas(es)" in out
    assert "Settings copied from the earlier install: reply_style" in out and "All good" in out
    assert ("reply_style", "text") in ctx.config_writes
    (isolated_hermes_home / "plugins" / "hermes-atlas").mkdir(parents=True)
    hermes_config["plugins"]["entries"][PLUGIN_NAME] = {"settings": {"reply_style": "text"}}
    assert run_cli(ctx, "migrate") == 0
    out = capsys.readouterr().out
    assert "Settings: nothing to copy" in out and "hermes plugins remove hermes-atlas" in out


def test_the_doctor_reports_what_the_earlier_install_left(isolated_hermes_home, hermes_config):
    assert doctor.check_legacy()[0] == doctor.OK
    (isolated_hermes_home / "plugins" / "hermes-atlas").mkdir(parents=True)
    (isolated_hermes_home / "desktop-plugins" / "hermes-atlas").mkdir(parents=True)
    findings = doctor.legacy_findings()
    assert any("hermes plugins remove hermes-atlas" in f for f in findings)
    assert any("Rescan" in f for f in findings)
    status, name, detail = doctor.check_legacy()
    assert status == doctor.WARN and name == "earlier install"
    (isolated_hermes_home / "plugins" / "hermes-atlas").rmdir()
    hermes_config["plugins"] = {"enabled": ["hermes-atlas", "other"]}
    assert any("plugins.enabled" in f for f in doctor.legacy_findings())


def test_atlas_status_points_to_the_doctor_when_something_was_left(isolated_hermes_home):
    ctx, _ = registered(HostContext)
    assert "hermes-atlas" not in ctx.slash("atlas")
    (isolated_hermes_home / "plugins" / "hermes-atlas").mkdir(parents=True)
    assert "hermes atlas doctor" in ctx.slash("atlas")


def test_registration_warns_about_a_renamed_folder_or_a_competing_install(tmp_path, caplog):
    old = tmp_path / "plugins" / "hermes-atlas"
    old.mkdir(parents=True)
    (old / "plugin.yaml").write_text("name: atlas-intelligent-ui\n", encoding="utf-8")
    with caplog.at_level(logging.WARNING):
        warn_about_earlier_install(old)
    assert "refuses updates" in caplog.text and "hermes plugins remove hermes-atlas" in caplog.text
    caplog.clear()
    new = tmp_path / "plugins" / PLUGIN_NAME
    new.mkdir()
    (new / "plugin.yaml").write_text("name: atlas-intelligent-ui\n", encoding="utf-8")
    with caplog.at_level(logging.WARNING):
        warn_about_earlier_install(new)
    assert "still installed" in caplog.text and "refuses" not in caplog.text


def test_the_skill_frontmatter_keeps_lists_so_hermes_shows_the_skill(monkeypatch):
    ctx, _ = registered(HostContext)
    frontmatter = ctx.skills["canvas"]["frontmatter"]
    assert frontmatter["name"] == "canvas" and not isinstance(frontmatter.get("platforms", []), str)
    assert _flat_frontmatter(["platforms: [linux, macos, windows]", "name: x"]) == {
        "platforms": ["linux", "macos", "windows"], "name": "x"}
    yaml = pytest.importorskip("yaml")
    module = types.ModuleType("hermes_yaml")
    module.safe_load = yaml.safe_load
    monkeypatch.setitem(sys.modules, "hermes_yaml", module)
    parsed = skill_frontmatter(doctor.ROOT / "skills" / "canvas" / "SKILL.md")
    assert parsed["metadata"]["hermes"]["tags"][0] == "UI" and parsed["version"] == doctor.__version__


@pytest.fixture
def desktop_transport(monkeypatch):
    """Hermes's broadcast as it exists in a process that runs the TUI gateway server."""
    sent = []
    plugin_events = types.ModuleType("hermes_cli.plugin_events")
    plugin_events.broadcast_plugin_event = lambda plugin_id, event, payload: sent.append((plugin_id, event, payload))
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", plugin_events)
    monkeypatch.setitem(sys.modules, "tui_gateway.server", types.ModuleType("tui_gateway.server"))
    monkeypatch.delenv("HERMES_PLUGIN_HOST_PROCESS", raising=False)
    return sent


def test_broadcasts_only_where_desktop_windows_can_be_connected(monkeypatch, desktop_transport):
    assert events.broadcast("canvas.saved", {"id": "x"}) is True
    assert desktop_transport == [(PLUGIN_NAME, "canvas.saved", {"id": "x"})]
    monkeypatch.setenv("HERMES_PLUGIN_HOST_PROCESS", "1")
    assert events.broadcast("canvas.saved", {"id": "y"}) is False
    monkeypatch.delenv("HERMES_PLUGIN_HOST_PROCESS")
    monkeypatch.delitem(sys.modules, "tui_gateway.server")
    assert events.broadcast("canvas.saved", {"id": "z"}) is False
    assert len(desktop_transport) == 1


def test_the_session_hears_about_every_agent_save(desktop_transport):
    ctx, _ = registered(HostContext)
    created = ctx.call("atlas_render", {"canvas": TRIP})
    assert [event for _, event, _ in ctx.session_events] == ["canvas.saved"]
    assert ctx.session_events[0][2] == {"id": created["id"], "revision": 1, "title": "Viagem a Lisboa"}
    assert desktop_transport and desktop_transport[0][2]["origin"] == "agent"


def test_a_saved_canvas_is_reported_saved_even_if_its_page_cannot_be_written(monkeypatch):
    ctx, _ = registered(HostContext, settings={"reply_style": "file"})
    tools = importlib.import_module(module_name_for(PLUGIN_NAME) + ".hermes_atlas.agent.tools")

    def full_disk(*args, **kwargs):
        raise OSError(28, "No space left on device")
    monkeypatch.setattr(tools, "write_export", full_disk)
    result = ctx.call("atlas_render", {"canvas": TRIP})
    assert result["success"] and result["status"] == "created" and result["show"] in {"directive", "text"}
    assert len(ctx.call("atlas_list")["canvases"]) == 1


def test_pruning_exports_tolerates_files_removed_meanwhile(tmp_path, monkeypatch):
    from hermes_atlas.agent import tools
    monkeypatch.setattr(tools, "EXPORTS_KEPT", 1)
    for index in range(3):
        (tmp_path / f"canvas-{index}.html").write_text("x", encoding="utf-8")
    real_stat = type(tmp_path).stat

    def vanishing(path, *args, **kwargs):
        if path.name == "canvas-1.html":
            raise FileNotFoundError(path)
        return real_stat(path, *args, **kwargs)
    with monkeypatch.context() as patch:
        patch.setattr(type(tmp_path), "stat", vanishing)
        tools._prune(tmp_path)
    assert len([p for p in tmp_path.iterdir() if p.suffix == ".html"]) == 2


def secret_scope(monkeypatch, get_secret):
    agent = types.ModuleType("agent")
    module = types.ModuleType("agent.secret_scope")
    module.get_secret = get_secret
    agent.secret_scope = module
    monkeypatch.setitem(sys.modules, "agent", agent)
    monkeypatch.setitem(sys.modules, "agent.secret_scope", module)


def test_settings_survive_a_partly_importable_hermes(monkeypatch):
    """Hermes's Python with its packages but not its top-level modules (a service started without
    the checkout on sys.path): get_secret itself fails to import hermes_scope."""
    def broken(name, default=None):
        raise ModuleNotFoundError("No module named 'hermes_scope'")
    secret_scope(monkeypatch, broken)
    monkeypatch.setenv("ATLAS_HERMES_URL", "http://127.0.0.1:9999/v1")
    assert runtime.setting("ATLAS_HERMES_URL") == "http://127.0.0.1:9999/v1"
    assert runtime.gateway_url().endswith(":9999/v1")


def test_the_secret_scope_refusal_is_never_bypassed(monkeypatch):
    """Under multiplexing Hermes refuses to read a secret without a scope; falling back to the
    process environment there could read another profile's key."""
    class UnscopedSecretError(RuntimeError):
        pass

    def refuse(name, default=None):
        raise UnscopedSecretError(name)
    secret_scope(monkeypatch, refuse)
    monkeypatch.setenv("API_SERVER_KEY", "another-profile")
    with pytest.raises(UnscopedSecretError):
        runtime.setting("API_SERVER_KEY")


def test_the_standalone_app_reads_the_api_key_where_hermes_keeps_it(isolated_hermes_home, monkeypatch):
    (isolated_hermes_home / ".env").write_text('OTHER=1\nexport API_SERVER_KEY="from-dotenv" # comment\n',
                                              encoding="utf-8")
    monkeypatch.setattr(runtime, "_standalone", False)
    assert runtime.api_server_key() == "", "inside Hermes the key comes from the secret scope only"
    monkeypatch.setattr(runtime, "_standalone", True)
    assert runtime.api_server_key() == "from-dotenv"
    monkeypatch.setenv("ATLAS_HERMES_API_KEY", "explicit")
    assert runtime.api_server_key() == "explicit"
