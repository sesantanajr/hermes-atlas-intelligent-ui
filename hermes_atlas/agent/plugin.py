"""``register(ctx)``: everything Atlas adds to a Hermes profile.

* seven tools in the ``atlas`` toolset;
* the ``hermes-atlas:canvas`` skill, which teaches the model the workflow;
* the ``/atlas`` slash command, on every surface;
* the ``hermes atlas`` terminal command;
* a ``pre_llm_call`` hook that tells the agent when the user changed one of its canvases.

Registration is cheap by design: it imports no pydantic model and opens no database, so it
costs a few milliseconds of Hermes's start-up. Surfaces that only some Hermes releases offer are
feature-detected, and an optional registration that fails is logged, never fatal.
"""
import logging
from pathlib import Path

from . import cli, commands, hooks, tool_schemas, tools
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
    """``name`` / ``description`` / ... from the ``---`` block that opens a SKILL.md."""
    fields = {}
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return fields
    if not lines or lines[0].strip() != "---":
        return fields
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" in line and not line.startswith((" ", "\t", "#")):
            key, _, value = line.partition(":")
            fields[key.strip()] = value.strip().strip("\"'")
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


def register(ctx):
    settings = Settings(ctx)
    handlers = tools.handlers(ctx, settings)
    for schema in tool_schemas.ALL:
        name = schema["name"]
        extra = {"check_fn": lambda: settings.resources_tool} if name == "atlas_resources" else {}
        ctx.register_tool(name=name, toolset=tool_schemas.TOOLSET, schema=schema, handler=handlers[name],
                          description=schema["description"].split(". ")[0] + ".", emoji=EMOJI, **extra)
    ctx.register_hook("pre_llm_call", hooks.make_pre_llm_call(settings))
    _optional(ctx, "register_command", commands.NAME, commands.make_handler(settings),
              description=commands.DESCRIPTION, args_hint=commands.ARGS_HINT)
    _optional(ctx, "register_cli_command", name=cli.NAME, help=cli.HELP, setup_fn=cli.setup, handler_fn=cli.handle,
              description=cli.HELP)
    register_skills(ctx)
