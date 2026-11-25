"""A stand-in for the parts of Hermes Agent that load and call a plugin.

It reproduces, from the Hermes source, the contract a third-party plugin is held to:

* **import**: ``hermes_cli/plugins_loader.py::_load_directory_module`` imports the plugin's
  ``__init__.py`` as ``hermes_plugins.<slug>`` with the plugin directory as its package path and
  nothing added to ``sys.path``;
* **ctx**: the method signatures of ``hermes_cli/plugins_context.py::PluginContext``;
* **tool dispatch**: ``tools/registry.py`` calls ``handler(args, **context)``, forwards only the
  context keywords a signature names (all of them to ``**kwargs``) and requires a ``str`` result;
* **hook dispatch**: keyword arguments only.

``HostContext`` models current Hermes; ``LegacyHostContext`` models 0.21, which lacks the
session-surface and session-event APIs. Checked against upstream ``main`` (7c88e98, 2026-11-20)
and the 0.21.1 release.
"""
import importlib.util
import inspect
import json
import sys
import types
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[1]
NS_PARENT = "hermes_plugins"
CONTEXT_KEYWORDS = ("task_id", "session_id", "conversation_id", "user_task")


def module_name_for(key):
    return f"{NS_PARENT}.{key.replace('/', '__').replace('-', '_')}"


def evict(module_name):
    for name in [n for n in sys.modules if n == module_name or n.startswith(module_name + ".")]:
        del sys.modules[name]


def load_plugin(plugin_dir=PLUGIN_DIR, key="atlas-intelligent-ui"):
    """Import a directory plugin exactly the way Hermes does and return the module."""
    plugin_dir = Path(plugin_dir)
    init_file = plugin_dir / "__init__.py"
    if not init_file.exists():
        raise FileNotFoundError(f"No __init__.py in {plugin_dir}")
    if NS_PARENT not in sys.modules:
        namespace = types.ModuleType(NS_PARENT)
        namespace.__path__ = []
        namespace.__package__ = NS_PARENT
        sys.modules[NS_PARENT] = namespace
    module_name = module_name_for(key)
    evict(module_name)
    spec = importlib.util.spec_from_file_location(module_name, init_file, submodule_search_locations=[str(plugin_dir)])
    module = importlib.util.module_from_spec(spec)
    module.__package__ = module_name
    module.__path__ = [str(plugin_dir)]
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        evict(module_name)
        raise
    return module


def _narrow(function, context):
    """Hermes forwards only the context keywords a callable declares; ``**kwargs`` receives all."""
    parameters = inspect.signature(function).parameters.values()
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters):
        return dict(context)
    names = {p.name for p in parameters}
    return {key: value for key, value in context.items() if key in names}


class LegacyHostContext:
    """``PluginContext`` as of Hermes 0.21: the surface every supported release has."""

    def __init__(self, settings=None, session_id="20261121_101500_ab12cd", conversation_id=None):
        self.tools, self.hooks, self.commands, self.cli_commands, self.skills = {}, {}, {}, {}, {}
        self.settings = dict(settings or {})
        self.session_id = session_id
        self.conversation_id = conversation_id or session_id
        self.plugin_id = "atlas-intelligent-ui"
        self.profile_name = "default"

    # -- registration (signatures copied from PluginContext) -----------------------------------
    def register_tool(self, name: str, toolset: str, schema: dict, handler, check_fn=None, requires_env=None,
                      is_async: bool = False, description: str = "", emoji: str = "", override: bool = False):
        if not isinstance(schema, dict):
            raise ValueError(f"Tool {name!r}: schema must be a dict, got {type(schema).__name__}")
        params = schema.get("parameters")
        if params is not None and not isinstance(params, dict):
            raise ValueError(f"Tool {name!r}: schema['parameters'] must be an object")
        if name in self.tools:
            raise AssertionError(f"tool {name} registered twice")
        self.tools[name] = {"toolset": toolset, "schema": schema, "handler": handler, "check_fn": check_fn,
                            "is_async": is_async, "description": description, "emoji": emoji}

    def register_hook(self, hook_name: str, callback):
        self.hooks.setdefault(hook_name, []).append(callback)

    def register_command(self, name: str, handler, description: str = "", args_hint: str = "", argument_mode=None):
        clean = name.lower().strip().lstrip("/").replace(" ", "-")
        self.commands[clean] = {"handler": handler, "description": description, "args_hint": args_hint}

    def register_cli_command(self, name: str, help: str, setup_fn, handler_fn=None, description: str = ""):
        self.cli_commands[name] = {"help": help, "setup_fn": setup_fn, "handler_fn": handler_fn}

    def register_skill(self, name: str, path, description: str = "", frontmatter=None):
        import re
        if ":" in name or not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
            raise ValueError(f"Invalid skill name '{name}'")
        if not Path(path).exists():
            raise FileNotFoundError(f"SKILL.md not found at {path}")
        self.skills[name] = {"path": Path(path), "description": description, "frontmatter": dict(frontmatter or {})}

    def get_config(self, key: str, default=None):
        return self.settings.get(key, default)

    # -- dispatch ------------------------------------------------------------------------------
    def context(self, **overrides):
        return {"task_id": "task-1", "session_id": self.session_id, "conversation_id": self.conversation_id,
                "user_task": "", **overrides}

    def call_raw(self, name, args=None, **overrides):
        """What the registry hands back to the model: the handler's return value, unparsed."""
        handler = self.tools[name]["handler"]
        return handler(args, **_narrow(handler, self.context(**overrides)))

    def call(self, name, args=None, **overrides):
        result = self.call_raw(name, {} if args is None else args, **overrides)
        assert isinstance(result, str), f"{name} returned {type(result).__name__}; Hermes requires a JSON string"
        return json.loads(result)

    def visible_tools(self):
        """Tools whose ``check_fn`` (a passive availability probe) lets the model see them."""
        return sorted(name for name, entry in self.tools.items() if entry["check_fn"] is None or entry["check_fn"]())

    def fire(self, hook_name, **payload):
        """Invoke a hook the way Hermes does (keywords only) and collect non-empty returns."""
        out = []
        for callback in self.hooks.get(hook_name, []):
            value = callback(**_narrow(callback, payload))
            if value:
                out.append(value)
        return out

    def slash(self, name, raw_args="", **session):
        handler = self.commands[name]["handler"]
        return handler(raw_args, **_narrow(handler, session))


class HostContext(LegacyHostContext):
    """``PluginContext`` on current Hermes: adds the session surface, the turn's client (0.23),
    session events and plugin RPC methods."""

    def __init__(self, *args, surface="", client=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.surface = surface
        # The client Hermes reports for a turn: Hermes Desktop by default on the desktop surface,
        # as on a real install; pass ``client=False`` for a turn whose client announced nothing.
        if client is None and surface == "desktop":
            client = {"name": "hermes-desktop", "kind": "desktop"}
        self.client = client or None
        self.session_events = []
        self.config_writes = []
        self.rpc_methods = {}

    def turn_client(self):
        return dict(self.client) if self.client else None

    def register_rpc(self, name, handler):
        """``plugin.<plugin_id>.<name>`` (hermes_cli/plugin_rpc.py, Hermes 0.23)."""
        method = f"plugin.{self.plugin_id}.{name}"
        if method in self.rpc_methods:
            raise ValueError(f"{method} registered twice")
        self.rpc_methods[method] = handler

    def rpc(self, name, params, session_id=None):
        """Call a registered method the way the gateway's session authority does."""
        import json as _json
        handler = self.rpc_methods[f"plugin.{self.plugin_id}.{name}"]
        result = handler(dict(params), session_id=session_id)
        return _json.loads(_json.dumps(result, allow_nan=False))

    def register_hook(self, hook_name: str, callback, *, hold_stream: bool = False):
        self.hooks.setdefault(hook_name, []).append(callback)

    def set_config(self, key: str, value) -> None:
        """``plugins.entries.<plugin_id>.settings.<key>`` (PluginContext.set_config, Hermes 0.23)."""
        self.settings[key] = value
        self.config_writes.append((key, value))

    def session_surface(self) -> str:
        return self.surface

    def emit_to_session(self, session_id, event, payload=None):
        self.session_events.append((session_id, event, payload))
        return True


def registered(context_class=HostContext, **kwargs):
    """Load the plugin and run ``register(ctx)``; returns ``(ctx, module)``."""
    module = load_plugin()
    ctx = context_class(**kwargs)
    module.register(ctx)
    return ctx, module
