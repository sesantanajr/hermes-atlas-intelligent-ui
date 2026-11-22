"""The ``/atlas`` slash command: the library from any Hermes surface, as text.

It works where the interactive UI does not exist (terminal, Telegram, Discord, WhatsApp...).
The handler runs inside the gateway, so it returns the text to show and never prints.
Hermes calls it as ``handler(raw_args)`` plus the session keywords it declares; ``**kwargs``
opts into all of them (``platform``, ``session_id``, ``session_key``, ``source``).
"""
import logging
import re

from .. import __version__
from .locale import resolve as resolve_locale
from .messages import text

logger = logging.getLogger(__name__)

NAME = "atlas"
DESCRIPTION = "Atlas canvases: list, read as text or export"
ARGS_HINT = "[list|show|export|help] [canvas]"

# Surfaces that draw Markdown tables; every other platform gets lists and a shorter reply.
_RICH = {"", "cli", "tui", "desktop", "local", "api_server", "acp", "codex", "tool"}
_FORMATS = {"html": "html", "md": "markdown", "markdown": "markdown", "json": "json"}
_ID = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")


def _when(stamp):
    return str(stamp or "")[:16].replace("T", " ")


def _rows(locale, canvases):
    return "\n".join(text(locale, "row", title=c["title"], revision=c["revision"], updated=_when(c["updated"]), id=c["id"])
                     for c in canvases)


def find_canvas(store, query, revision=None):
    """A canvas by exact id, else the most recently updated one whose title contains *query*."""
    if _ID.match(query):
        record = store.get(query, revision)
        if record:
            return record
    matches = store.list(0, 1, query)
    return store.get(matches[0]["id"], revision) if matches else None


def run(raw_args, *, platform="", locale="pt"):
    from ..runtime import data_dir, profile_name
    from ..storage.store import Store

    words = (raw_args or "").split()
    action = words[0].lower() if words else "status"
    rest = words[1:]
    rich = platform.lower() in _RICH
    if action in ("help", "-h", "--help", "ajuda", "?"):
        return text(locale, "usage")
    store = Store()
    if action in ("status", "info"):
        stats = store.stats()
        lines = [text(locale, "title", version=__version__), text(locale, "profile", profile=profile_name()),
                 text(locale, "library", **stats), text(locale, "data", path=data_dir())]
        recent = store.list(0, 5, "")
        lines += ["", text(locale, "recent"), _rows(locale, recent)] if recent else ["", text(locale, "empty")]
        return "\n".join(lines + ["", text(locale, "open_hint"), "/atlas help"])
    if action in ("list", "ls", "listar"):
        query = " ".join(rest)
        found = store.list(0, 20, query)
        if not found:
            return text(locale, "none_found", query=query) if query else text(locale, "empty")
        return text(locale, "recent") + "\n" + _rows(locale, found)
    if action in ("show", "ver", "export", "exportar"):
        if not rest:
            return text(locale, "usage")
        exporting = action in ("export", "exportar")
        option = rest[-1].lower() if len(rest) > 1 else ""
        kind, revision = "html", None
        if exporting and option in _FORMATS:
            kind, rest = _FORMATS[option], rest[:-1]
        elif not exporting and option.isdigit() and int(option) > 0:
            revision, rest = int(option), rest[:-1]
        query = " ".join(rest)
        record = find_canvas(store, query, revision)
        if not record:
            return text(locale, "not_found", query=query)
        if exporting:
            from .tools import ToolError, write_export
            try:
                path = write_export(record, kind, locale)
            except ToolError:
                path = write_export(record, "markdown", locale)
            return text(locale, "exported", path=path) + f"\nMEDIA:{path}"
        from ..render import render_canvas
        return render_canvas(record["canvas"], locale=locale, tables=rich, revision=record["revision"],
                             max_chars=12_000 if rich else 3_500)
    return text(locale, "usage")


def make_handler(settings):
    def atlas_command(raw_args="", **kwargs):
        locale = resolve_locale(settings.locale)
        try:
            return run(raw_args, platform=str(kwargs.get("platform") or ""), locale=locale)
        except Exception as exc:  # a slash command answers with text, never with a traceback
            logger.exception("/atlas failed")
            return text(locale, "error", detail=f"{type(exc).__name__}: {exc}"[:300])
    return atlas_command
