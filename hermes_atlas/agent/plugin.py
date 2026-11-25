"""``register(ctx)``: everything Atlas adds to a Hermes profile.

* seven tools in the ``atlas`` toolset;
* the ``atlas-intelligent-ui:canvas`` skill, which teaches the model the workflow;
* the ``/atlas`` slash command, on every surface;
* the ``hermes atlas`` terminal command;
* a ``pre_llm_call`` hook that tells the agent when the user changed one of its canvases;
* the ``plugin.atlas-intelligent-ui.http`` RPC method, the Atlas API for Hermes Desktop and the
  Webapp on every profile (Hermes 0.23+).

Registration is cheap by design: it imports no pydantic model and opens no database, so it
costs a few milliseconds of Hermes's start-up. Surfaces that only some Hermes releases offer are
feature-detected, and an optional registration that fails is logged, never fatal.
"""
import logging
import os
from pathlib import Path

from .. import LEGACY_PLUGIN_NAMES, PLUGIN_NAME
from . import cli, commands, hooks, rpc, tool_schemas, tools
from .settings import Settings

logger = logging.getLogger(__name__)

PLUGIN_ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = PLUGIN_ROOT / "skills"
HOOKS = ("pre_llm_call",)
EMOJI = "🧭"


def _optional(ctx, method, *args, **kwargs):
    """Call a ``ctx`` method that older Hermes releases may lack; report what was registered."""
    function = getattr(ctx, method, None)
    if not callable(function):
        logger.debug("Atlas: this Hermes has no ctx.%s; skipping", method)
        return False
    try:
        function(*args, **kwargs)
        return True
    except Exception as exc:
        logger.warning("Atlas: ctx.%s failed and was skipped: %s", method, exc)
        return False


def skill_frontmatter(path):
    """The ``---`` block that opens a SKILL.md, as Hermes itself reads it.

    Hermes hands this dict to its skill filters as it is, so lists must stay lists: a
    ``platforms`` value passed as the string ``"[linux, macos, windows]"`` matches no operating
    system and hides the skill from the model. Hermes's public YAML loader is used when present;
    elsewhere a flat reading keeps top-level scalars and inline ``[a, b]`` lists.
    """
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    if not lines or lines[0].strip() != "---":
        return {}
    block = []
    for line in lines[1:]:
        if line.strip() == "---":
            break
        block.append(line)
    else:
        return {}
    try:
        from hermes_yaml import safe_load
    except ImportError:
        safe_load = None
    if safe_load is not None:
        try:
            data = safe_load("\n".join(block))
        except Exception as exc:
            logger.debug("Atlas could not parse the frontmatter of %s: %s", path, exc)
        else:
            if isinstance(data, dict):
                return data
    return _flat_frontmatter(block)


def _flat_frontmatter(block):
    fields = {}
    for line in block:
        if ":" not in line or line.startswith((" ", "\t", "#")):
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            fields[key.strip()] = [item.strip().strip("\"'") for item in value[1:-1].split(",") if item.strip()]
        elif value:
            fields[key.strip()] = value.strip("\"'")
    return fields


def register_skills(ctx):
    registered = []
    if not SKILLS_DIR.is_dir():
        return registered
    for folder in sorted(SKILLS_DIR.iterdir()):
        document = folder / "SKILL.md"
        if not folder.is_dir() or not document.is_file():
            continue
        meta = skill_frontmatter(document)
        if (_optional(ctx, "register_skill", folder.name, document, description=meta.get("description", ""), frontmatter=meta)
                or _optional(ctx, "register_skill", folder.name, document)):
            registered.append(folder.name)
    return registered


def warn_about_earlier_install(root=PLUGIN_ROOT):
    """Two stat calls: say in the log when this copy cannot be updated or an earlier one competes."""
    if root.parent.name != "plugins" or not (root / "plugin.yaml").is_file():
        return
    if root.name != PLUGIN_NAME:
        logger.warning("Atlas %s is loaded from plugins/%s; Hermes refuses updates of a renamed plugin. "
                       "Reinstall it: hermes plugins remove %s && hermes plugins install "
                       "sesantanajr/hermes-atlas-intelligent-ui", PLUGIN_NAME, root.name, root.name)
    for name in LEGACY_PLUGIN_NAMES:
        if name != root.name and (root.parent / name).is_dir():
            logger.warning("Atlas: plugins/%s (the earlier Atlas) is still installed and registers the same "
                           "atlas tools; remove it with: hermes plugins remove %s", name, name)


def register(ctx):
    warn_about_earlier_install()
    settings = Settings(ctx)
    handlers = tools.handlers(ctx, settings)
    for schema in tool_schemas.ALL:
        name = schema["name"]
        extra = {"check_fn": lambda: settings.resources_tool} if name == "atlas_resources" else {}
        ctx.register_tool(name=name, toolset=tool_schemas.TOOLSET, schema=schema, handler=handlers[name],
                          description=schema["description"].split(". ")[0] + ".", emoji=EMOJI, **extra)
    ctx.register_hook("pre_llm_call", hooks.make_pre_llm_call(settings))
    rpc.register(ctx)
    _optional(ctx, "register_command", commands.NAME, commands.make_handler(settings),
              description=commands.DESCRIPTION, args_hint=commands.ARGS_HINT)
    # Under plugins.isolation: host, Hermes runs terminal commands of plugins only from its own
    # process and logs a warning for every registration attempted inside the plugin host.
    if os.environ.get("HERMES_PLUGIN_HOST_PROCESS") != "1":
        cli.bind(ctx)  # `hermes atlas migrate` writes settings through it
        _optional(ctx, "register_cli_command", name=cli.NAME, help=cli.HELP, setup_fn=cli.setup,
                  handler_fn=cli.handle, description=cli.HELP)
    register_skills(ctx)
