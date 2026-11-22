"""The Hermes plugin contract, checked against a faithful host double (``tests/hermes_host.py``).

These tests fail for the reasons ``hermes plugins doctor`` and ``hermes plugins validate`` fail:
tools that are registered but not declared, handlers that return something other than a string,
hook callbacks without ``**kwargs``, imports of Hermes internals, and registration that is slow
or has side effects.
"""
import argparse
import ast
import inspect
import json
import re
import sys
from pathlib import Path

import pytest

from hermes_host import NS_PARENT, HostContext, LegacyHostContext, load_plugin, module_name_for, registered

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = (ROOT / "plugin.yaml").read_text(encoding="utf-8")

# hermes_cli/plugins.py::VALID_HOOKS (the subset a general plugin can meaningfully use).
VALID_HOOKS = {
    "pre_tool_call", "post_tool_call", "transform_terminal_output", "transform_tool_result", "transform_llm_output",
    "pre_llm_call", "post_llm_call", "on_session_start", "on_session_end", "on_session_finalize", "on_session_reset"}

# Names a plugin may import from Hermes: hermes_cli/data/plugin_api.json (a module entry allows its
# public names). Atlas uses five of them; anything else here is a contract violation.
PUBLIC_HERMES_IMPORTS = {
    ("agent.secret_scope", "get_secret"), ("hermes_constants", "get_hermes_home"),
    ("plugins.plugin_storage", "plugin_data_dir"), ("hermes_cli.config", "load_config_readonly"),
    ("gateway.session_context", "get_session_env"), ("hermes_cli.plugin_events", "broadcast_plugin_event"),
    ("hermes_yaml", "safe_load"),
}
HERMES_TOP_LEVEL = {"agent", "gateway", "hermes_cli", "hermes_constants", "hermes_state", "plugins", "tools", "pm",
                    "persistence", "persistence_assembly", "providers", "cron", "hermes_platform", "hermes_yaml",
                    "hermes_logging", "run_agent", "model_tools", "toolsets", "utils", "cli", "tui_gateway"}


def yaml_list(key):
    block = re.search(rf"(?m)^{key}:\s*\n((?:[ \t]+-[^\n]*\n?)+)", MANIFEST)
    return [line.split("-", 1)[1].strip() for line in block.group(1).splitlines()] if block else []


def runtime_sources():
    yield ROOT / "__init__.py"
    yield ROOT / "dashboard" / "plugin_api.py"
    yield from sorted((ROOT / "hermes_atlas").rglob("*.py"))


@pytest.fixture
def host():
    ctx, module = registered()
    return ctx


def test_plugin_is_imported_under_the_hermes_namespace_with_relative_imports_only():
    module = load_plugin()
    assert module.__name__ == module_name_for("atlas-intelligent-ui") == f"{NS_PARENT}.atlas_intelligent_ui"
    assert callable(module.register)
    for path in runtime_sources():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = [alias.name for alias in node.names] if isinstance(node, ast.Import) else \
                [node.module] if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module else []
            for name in names:
                assert name.split(".")[0] != "hermes_atlas", \
                    f"{path.relative_to(ROOT)} imports {name} absolutely; the plugin directory is not on sys.path"


def test_registration_matches_the_manifest_exactly(host):
    assert sorted(host.tools) == sorted(yaml_list("provides_tools"))
    assert sorted(host.hooks) == sorted(yaml_list("provides_hooks"))
    assert set(host.hooks) <= VALID_HOOKS
    assert {entry["toolset"] for entry in host.tools.values()} == {"atlas"}
    assert "atlas" in host.commands and "atlas" in host.cli_commands
    assert set(host.skills) == {"canvas"}


def test_manifest_has_what_hermes_validate_requires():
    for field in ("name", "version", "description"):
        assert re.search(rf"(?m)^{field}:\s*\S", MANIFEST), field
    assert re.search(r'(?m)^name:\s*atlas-intelligent-ui\s*$', MANIFEST)
    assert re.search(r'(?m)^manifest_version:\s*2\s*$', MANIFEST)
    assert re.search(r'(?m)^requires_hermes:\s*">=\d+\.\d+\.\d+"\s*$', MANIFEST)
    # Atlas ships no Python requirements of its own: Hermes core provides everything it imports.
    assert not re.search(r"(?m)^(python_dependencies|pip_dependencies):", MANIFEST)
    assert not (ROOT / "requirements.txt").exists()
    pyproject = ROOT / "pyproject.toml"
    if pyproject.exists():
        assert not re.search(r"(?m)^\[project\]", pyproject.read_text(encoding="utf-8")), \
            "a [project] table beside plugin.yaml makes Hermes resolve dependencies on enable"


def test_tool_schemas_are_well_formed(host):
    for name, entry in host.tools.items():
        schema = entry["schema"]
        assert schema["name"] == name
        assert 40 <= len(schema["description"]) <= 700, name
        params = schema["parameters"]
        assert params["type"] == "object" and isinstance(params["properties"], dict), name
        assert set(params.get("required", [])) <= set(params["properties"]), name
        json.dumps(schema)  # must serialise into every provider request
        assert callable(entry["handler"]) and not entry["is_async"]


def test_handlers_follow_the_calling_convention_and_never_raise(host):
    hostile = [None, {}, [], "text", 7, {"canvas": None}, {"canvas": []}, {"id": 5}, {"id": "../x"},
               {"id": "missing"}, {"id": "missing", "expected_revision": "1", "operations": "x"},
               {"type": 5, "types": "x", "q": 3}, {"limit": 10**9, "offset": -1}, {"format": "exe", "id": "missing"},
               {"canvas": {"title": "x", "blocks": [{"type": "nope", "id": "a", "title": "a"}]}}]
    for name, entry in host.tools.items():
        signature = inspect.signature(entry["handler"])
        assert any(p.kind is inspect.Parameter.VAR_KEYWORD for p in signature.parameters.values()), \
            f"{name} must accept **kwargs: Hermes adds context keywords over time"
        for args in hostile:
            result = host.call_raw(name, args, turn_origin="plugin_fork:x", parent_agent=object())
            assert isinstance(result, str), (name, args)
            decoded = json.loads(result)
            assert isinstance(decoded, dict) and isinstance(decoded.get("success"), bool), (name, args)
            if not decoded["success"]:
                assert isinstance(decoded["error"], str) and decoded["error"], (name, args)
            assert len(result) <= 100_000, name  # Hermes's default tool result cap


def test_hook_callbacks_accept_kwargs_and_survive_any_payload(host):
    for name, callbacks in host.hooks.items():
        for callback in callbacks:
            parameters = inspect.signature(callback).parameters.values()
            assert any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters), \
                f"{name}: hermes plugins doctor reports a hook without **kwargs as an error"
    assert host.fire("pre_llm_call") == []
    assert host.fire("pre_llm_call", session_id=None, user_message=None, conversation_history=object(),
                     is_first_turn=True, model="m", platform="telegram", telemetry_schema_version=3,
                     a_field_added_next_year=1) == []


def test_slash_command_works_with_and_without_session_keywords(host):
    handler = host.commands["atlas"]["handler"]
    assert isinstance(handler("help"), str)
    assert isinstance(host.slash("atlas", "", platform="telegram", session_id="s", session_key="k", source=None), str)
    assert isinstance(host.slash("atlas", "show does-not-exist"), str)
    assert isinstance(handler(None), str)


def test_cli_command_builds_an_argparse_tree(host):
    entry = host.cli_commands["atlas"]
    parser = argparse.ArgumentParser(prog="hermes atlas")
    entry["setup_fn"](parser)
    args = parser.parse_args(["show", "canvas-1", "--revision", "2"])
    assert args.atlas_command == "show" and args.revision == 2 and callable(args.func)
    assert callable(entry["handler_fn"])


def test_skill_is_registered_with_a_description_for_the_skill_index(host):
    skill = host.skills["canvas"]
    assert skill["path"].name == "SKILL.md" and skill["path"].is_file()
    assert len(skill["description"]) > 60 and skill["frontmatter"]["name"] == "canvas"


def test_the_skill_example_is_a_valid_canvas(host):
    document = host.skills["canvas"]["path"].read_text(encoding="utf-8")
    example = json.loads(re.search(r"```json\n(.*?)\n```", document, re.S).group(1))
    result = host.call("atlas_render", example)
    assert result["success"], result


def test_older_hermes_without_optional_apis_still_gets_every_tool():
    ctx, _ = registered(LegacyHostContext)
    assert sorted(ctx.tools) == sorted(yaml_list("provides_tools"))
    assert "pre_llm_call" in ctx.hooks and "atlas" in ctx.commands and "canvas" in ctx.skills
    created = ctx.call("atlas_render", {"canvas": {"title": "T", "blocks": [{"type": "text", "id": "a", "title": "A", "text": "x"}]}})
    assert created["success"] and created["show"] == "either"


def test_a_host_with_only_tools_and_hooks_loads_the_plugin():
    class Minimal:
        def __init__(self):
            self.tools, self.hooks = {}, {}

        def register_tool(self, name, toolset, schema, handler, **kwargs):
            self.tools[name] = handler

        def register_hook(self, hook_name, callback):
            self.hooks[hook_name] = callback

    ctx = Minimal()
    load_plugin().register(ctx)
    assert len(ctx.tools) == 7 and "pre_llm_call" in ctx.hooks
    assert json.loads(ctx.tools["atlas_list"]({}))["success"]


def test_registration_is_cheap_and_free_of_side_effects(isolated_hermes_home):
    prefix = module_name_for("atlas-intelligent-ui") + ".hermes_atlas."
    registered()
    loaded = {name[len(prefix):] for name in sys.modules if name.startswith(prefix)}
    heavy = {name for name in loaded if name.split(".")[0] in {"schema", "storage", "server", "render", "catalog", "doctor"}}
    assert not heavy, f"register(ctx) imported {sorted(heavy)}; models, store and HTTP layer must load on first use"
    assert not (isolated_hermes_home / "plugin-data").exists(), "register(ctx) must not touch the file system"


def test_resources_tool_can_be_hidden_by_its_setting():
    ctx, _ = registered(settings={"resources_tool": False})
    assert "atlas_resources" not in ctx.visible_tools() and len(ctx.visible_tools()) == 6
    ctx, _ = registered()
    assert "atlas_resources" in ctx.visible_tools()


def test_only_public_hermes_modules_are_imported():
    found = set()
    for path in runtime_sources():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                if node.module.split(".")[0] in HERMES_TOP_LEVEL:
                    found |= {(node.module, alias.name) for alias in node.names}
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name.split(".")[0] not in HERMES_TOP_LEVEL or alias.name == "hermes_constants", \
                        f"{path.relative_to(ROOT)}: import the public name, not the module {alias.name}"
    assert found <= PUBLIC_HERMES_IMPORTS, f"imports outside Hermes's public plugin API: {sorted(found - PUBLIC_HERMES_IMPORTS)}"


def test_agent_layer_never_imports_the_http_stack():
    for path in sorted((ROOT / "hermes_atlas").rglob("*.py")):
        relative = path.relative_to(ROOT / "hermes_atlas").as_posix()
        if relative.startswith("server/") or relative == "doctor.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            modules = [a.name for a in node.names] if isinstance(node, ast.Import) else \
                [node.module or ""] if isinstance(node, ast.ImportFrom) and node.level == 0 else []
            for module in modules:
                assert module.split(".")[0] not in {"fastapi", "starlette", "httpx", "uvicorn"}, \
                    f"{relative} imports {module}; only hermes_atlas/server may use the HTTP stack"
            # The CLI's `serve` command is the one place outside server/ allowed to start it.
            if isinstance(node, ast.ImportFrom) and node.level and (node.module or "").startswith("server"):
                assert relative == "agent/cli.py", f"{relative} reaches into the server package"


def test_no_core_override_shapes():
    """``hermes plugins validate`` refuses plugins that rebind Hermes modules at runtime."""
    for path in runtime_sources():
        source = path.read_text(encoding="utf-8")
        assert not re.search(r"sys\.modules\[\s*['\"](?:hermes_|agent|gateway|tools|plugins)", source), path.name
        assert "mock.patch" not in source and "setattr(sys.modules" not in source, path.name
