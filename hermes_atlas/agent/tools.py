"""Tool handlers: what runs when the model calls an ``atlas_*`` tool.

Rules every handler follows (Hermes plugin contract):

* signature ``handler(args: dict, **kwargs) -> str``; Hermes passes ``task_id``, ``session_id``,
  ``conversation_id`` and more as keywords, and adds new ones over time;
* always return a JSON *string*, for failures too;
* never raise: an exception would surface as an opaque tool error.

Heavy imports (pydantic models, SQLite store) happen inside the handlers, on first use, so
registering the plugin adds nothing measurable to Hermes's start-up.
"""
import functools
import json
import logging
import os
import re
import unicodedata
from pathlib import Path

from .. import __version__
from .. import directive as inline
from . import canvas_ops, surfaces
from .canvas_ops import CanvasError
from .locale import resolve as resolve_locale

logger = logging.getLogger(__name__)

RESULT_LIMIT = 60_000        # characters of JSON a result may carry before falling back to an outline
EXPORTS_KEPT = 60            # newest files kept in <data dir>/exports
_ID = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")


class ToolError(Exception):
    """A refusal the model can act on."""


def _dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def tool(function):
    """Wrap a handler so it honours the contract above whatever happens inside."""
    @functools.wraps(function)
    def handler(args=None, **kwargs):
        try:
            result = function(args if isinstance(args, dict) else {}, **kwargs)
            return _dump({"success": True, **result})
        except (ToolError, CanvasError) as refusal:
            return _dump({"success": False, "error": str(refusal)[:2400]})
        except Exception as crash:  # the contract forbids raising, so the last resort is a report
            logger.exception("Atlas tool %s failed", function.__name__)
            return _dump({"success": False, "error": f"Atlas internal error ({type(crash).__name__}): {crash}"[:600]})
    return handler


def _store():
    from ..storage.store import Store
    return Store()


def _canvas_id(value):
    if not isinstance(value, str) or not _ID.match(value):
        raise ToolError("`id` must be a canvas id (letters, digits, _ and -). Use atlas_list to find it.")
    return value


def _revision(value, name="revision"):
    if value is None:
        return None
    if type(value) is not int or value < 1:
        raise ToolError(f"`{name}` must be a positive integer.")
    return value


def _save(store, canvas, expected):
    """Save a revision, explaining a refusal to the model in its own terms (the store's messages
    are written for people, in Portuguese)."""
    from ..storage.store import CANVAS_LIMIT_BYTES

    size = len(canvas.model_dump_json().encode())
    if size > CANVAS_LIMIT_BYTES:
        raise ToolError(f"The canvas is {size // 1000} KB; the limit is {CANVAS_LIMIT_BYTES // 1000} KB. "
                        "Use fewer or smaller blocks, or split it into several canvases.")
    try:
        return store.save(canvas, expected)
    except ValueError as exc:
        raise ToolError("The canvas changed while you were editing it. "
                        "Read the latest revision with atlas_get, then retry.") from exc


class Toolbox:
    """The handlers, bound to the plugin context they were registered with."""

    def __init__(self, ctx, settings):
        self.ctx = ctx
        self.settings = settings

    # -- how to show a canvas where the user is ------------------------------------------------
    def _presentation(self, store, record, session_id):
        surface = surfaces.current_surface(self.ctx)
        client_known, client = surfaces.current_client(self.ctx)
        desktop = store.client("desktop") or {}
        mode = surfaces.presentation(
            surface, style=self.settings.reply_style,
            desktop_extension=bool(desktop),
            desktop_media="tool_media" in (desktop.get("features") or []),
            atlas_chat=bool(session_id) and session_id.startswith("atlas-" + store.scope),
            client_known=client_known, client=client)
        line = inline.directive(record["id"], record["revision"])
        library = "It is saved in the user's Atlas library (Hermes Desktop or dashboard, Atlas page)."
        extra = {}
        if mode == "file":
            try:
                path = write_export(record, "html", resolve_locale(self.settings.locale))
            except Exception as exc:  # no viewer, a full disk, a broken asset: the next best way
                if not isinstance(exc, ToolError):
                    logger.warning("Atlas could not write the page of canvas %s: %s", record["id"], exc)
                mode = "directive" if desktop else "text"
            else:
                extra = {"file": str(path), "media": f"MEDIA:{path}"}
        if mode == "file":
            how = (f"Show it by ending your reply with this line, by itself: {extra['media']} "
                   "Hermes Desktop draws the interactive canvas there, and other apps receive it as a page "
                   "to open. Do not repeat the canvas content; one or two sentences of guidance at most.")
        elif mode == "directive":
            how = (f"Show it by writing this line by itself in your reply: {line} "
                   "The user's app replaces that line with the interactive canvas, so do not repeat its content; "
                   "add one or two sentences of guidance at most.")
        elif mode == "text":
            how = ("This chat cannot draw canvases: do not write the ::atlas line or a MEDIA line for it. Give the "
                   "essential content as plain text (a short list or a small table). " + library +
                   " If the user wants the interactive version, call atlas_export with format 'html' and send the "
                   "media line it returns: messaging apps deliver it as a page that opens in the browser.")
        else:
            how = (f"If the user is in Hermes Desktop or the Atlas chat, write this line by itself in your reply "
                   f"to show the canvas inline: {line} Otherwise summarise it in plain text. " + library)
        return {"surface": surface or "unknown", "show": mode, "directive": line, **extra, "present": how}

    def _announce(self, session_id, record):
        """Tell open front ends that a canvas changed, so they refresh without polling.

        The viewers of this session always get a session event (the one path that also works
        under ``plugins.isolation: host``); Desktop windows connected to this process also get a
        broadcast where Hermes can deliver one. Older releases have neither and the front ends poll.
        """
        from .. import events
        events.canvas_saved(record, "agent")
        emit = getattr(self.ctx, "emit_to_session", None)
        if not callable(emit) or not session_id:
            return
        try:
            emit(session_id, events.CANVAS_SAVED, events.canvas_payload(record))
        except Exception as exc:
            logger.debug("Atlas could not announce canvas %s: %s", record["id"], exc)

    def _saved(self, store, record, kwargs, verb):
        """Everything after the canvas is stored. It is saved at this point, so nothing here may turn
        the call into a failure: the model would retry and create a duplicate canvas."""
        session_id = str(kwargs.get("session_id") or "")
        try:
            store.link_canvas(record["id"], record["revision"], session_id=session_id,
                              conversation_id=str(kwargs.get("conversation_id") or ""))
        except Exception as exc:  # the link only drives "the user changed it" hints
            logger.warning("Atlas saved canvas %s but could not link it to the session: %s", record["id"], exc)
        self._announce(session_id, record)
        canvas = record["canvas"]
        result = {"id": record["id"], "revision": record["revision"], "title": canvas.get("title", ""),
                  "blocks": len(canvas.get("blocks", [])), "status": verb}
        try:
            return {**result, **self._presentation(store, record, session_id)}
        except Exception as exc:
            logger.warning("Atlas saved canvas %s but could not prepare its presentation: %s", record["id"], exc)
            line = inline.directive(record["id"], record["revision"])
            return {**result, "show": "either", "directive": line,
                    "present": (f"The canvas is saved. If the user is in Hermes Desktop or the Atlas chat, write this "
                                f"line by itself to show it: {line} Otherwise summarise it in plain text.")}

    # -- handlers ------------------------------------------------------------------------------
    def components(self, args, **kwargs):
        from .. import catalog
        wanted = [args["type"]] if isinstance(args.get("type"), str) and args["type"] else []
        if isinstance(args.get("types"), list):
            wanted += [name for name in args["types"] if isinstance(name, str) and name]
        wanted = list(dict.fromkeys(wanted))[:6]
        if wanted:
            known = set(catalog.types())
            blocks, unknown = [], [name for name in wanted if name not in known]
            for name in wanted:
                if name in known:
                    item = catalog.detail(name)
                    blocks.append({"type": name, "label": item.get("label_en") or item["label"],
                                   "category": item.get("category_id", ""), "purpose": item.get("summary", ""),
                                   "example": item["example"], "schema": item["schema"]})
            result = {"blocks": blocks}
            if unknown:
                result["unknown"] = unknown
                result["hint"] = "Call atlas_components with no arguments for the list of valid types."
            return result
        query, category = args.get("q", ""), args.get("category", "")
        if not isinstance(query, str) or not isinstance(category, str) or len(query) > 160 or len(category) > 80:
            raise ToolError("`q` and `category` must be short strings.")
        if query or category:
            matches = [{"type": m["type"], "label": m.get("label_en") or m["label"], "category": m.get("category_en", m["category"]),
                        "purpose": m.get("summary", "")} for m in catalog.search(query, category)]
            return {"matches": matches, "next": "Call atlas_components(type=...) for the schema and an example."}
        groups = []
        for group in catalog.categories():
            members = [catalog.entry(name) for name in group["types"]]
            groups.append({"category": group["id"], "label": group.get("label_en") or group["label"],
                           "types": {m["type"]: m.get("summary", m["label"]) for m in members}})
        return {"count": len(catalog.types()), "categories": groups,
                "next": "Call atlas_components(type=...) or types=[...] for the exact schema and a working example."}

    def render(self, args, **kwargs):
        data = args.get("canvas")
        if not isinstance(data, dict):
            raise ToolError("`canvas` must be an object with `title` and `blocks`.")
        store = _store()
        expected = args.get("expected_revision", 0)
        if type(expected) is int and expected > 0 and isinstance(data.get("id"), str):
            # Atlas 0.x let atlas_render replace a canvas; keep that working for saved prompts.
            canvas = canvas_ops.validate(data)
            verb = "updated"
        else:
            canvas = canvas_ops.validate({**data, "id": canvas_ops.new_id()})
            expected, verb = 0, "created"
        record = _save(store, canvas, expected)
        return self._saved(store, record, kwargs, verb)

    def update(self, args, **kwargs):
        canvas_id = _canvas_id(args.get("id"))
        expected = _revision(args.get("expected_revision"), "expected_revision")
        if expected is None:
            raise ToolError("`expected_revision` is required: pass the revision atlas_get returned.")
        store = _store()
        current = store.get(canvas_id)
        if not current:
            raise ToolError(f"No canvas with id '{canvas_id}'. Use atlas_list to find it.")
        if current["revision"] != expected:
            raise ToolError(f"The canvas is now at revision {current['revision']}, not {expected}: the user or another "
                            "turn changed it. Read it again with atlas_get, then retry.")
        canvas = canvas_ops.validate(canvas_ops.apply_operations(current["canvas"], args.get("operations")))
        record = _save(store, canvas, expected)
        store.discard_draft(canvas_id)
        return self._saved(store, record, kwargs, "updated")

    def get(self, args, **kwargs):
        canvas_id = _canvas_id(args.get("id"))
        revision = _revision(args.get("revision"))
        view = args.get("view") or "full"
        if view not in ("full", "outline", "text"):
            raise ToolError("`view` must be 'full', 'outline' or 'text'.")
        store = _store()
        record = store.get(canvas_id, revision)
        if not record:
            raise ToolError(f"No canvas with id '{canvas_id}'" + (f" at revision {revision}." if revision else ". Use atlas_list to find it."))
        canvas, result = record["canvas"], {"id": record["id"], "revision": record["revision"], "updated": record["updated"]}
        if revision is None:
            live = _live_state(store, record)
            if live:
                canvas = live["canvas"]
                result["unsaved_user_changes"] = live["updated"]
            store.mark_seen(canvas_id)
        result["title"] = canvas.get("title", "")
        if view == "text":
            from ..render import render_canvas
            result["text"] = render_canvas(canvas, locale=resolve_locale(self.settings.locale), max_chars=24_000,
                                           revision=record["revision"])
            return result
        outline = [{"id": b.get("id"), "type": b.get("type"), "title": b.get("title")} for b in canvas.get("blocks", [])]
        if view == "outline":
            return {**result, "blocks": outline}
        only = args.get("blocks")
        if isinstance(only, list) and only:
            chosen = {b for b in only if isinstance(b, str)}
            canvas = {**canvas, "blocks": [b for b in canvas.get("blocks", []) if b.get("id") in chosen],
                      "state": {k: v for k, v in (canvas.get("state") or {}).items() if k in chosen}}
            result["partial"] = True
        if len(_dump(canvas)) > RESULT_LIMIT:
            return {**result, "blocks": outline, "too_large": True,
                    "hint": "The canvas is too large to return at once. Pass `blocks` with the ids you need, or view='text'."}
        return {**result, "canvas": canvas}

    def listing(self, args, **kwargs):
        offset, limit, query = args.get("offset", 0), args.get("limit", 20), args.get("q", "")
        if (type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not isinstance(query, str) or len(query) > 256):
            raise ToolError("Invalid search or pagination parameters.")
        rows = _store().list(offset, limit, query)
        return {"canvases": rows, "offset": offset, "more": len(rows) == limit}

    def export(self, args, **kwargs):
        canvas_id = _canvas_id(args.get("id"))
        revision = _revision(args.get("revision"))
        kind = args.get("format") or "html"
        if kind not in ("html", "markdown", "json"):
            raise ToolError("`format` must be 'html', 'markdown' or 'json'.")
        store = _store()
        record = store.get(canvas_id, revision)
        if not record:
            raise ToolError(f"No canvas with id '{canvas_id}'. Use atlas_list to find it.")
        path = write_export(record, kind, resolve_locale(self.settings.locale))
        return {"id": record["id"], "revision": record["revision"], "format": kind, "path": str(path),
                "bytes": path.stat().st_size, "media": f"MEDIA:{path}",
                "present": "To deliver the file, write the `media` line by itself in your reply: Hermes Desktop shows "
                           "it as a file card and messaging apps attach it. In a terminal session, give the path instead."}

    def resources(self, args, **kwargs):
        from ..resources import snapshot
        return snapshot()


def _live_state(store, record):
    """The user's unsaved state of this revision: an inline-canvas draft or the Atlas workspace."""
    draft = store.draft(record["id"])
    if draft and draft.get("base_revision") == record["revision"] and draft["canvas"] != record["canvas"]:
        return {"canvas": draft["canvas"], "updated": draft["updated"]}
    workspace = store.doc("workspace", "current") or {}
    open_canvas = workspace.get("canvas")
    if (isinstance(open_canvas, dict) and open_canvas.get("id") == record["id"]
            and workspace.get("revision") == record["revision"] and open_canvas != record["canvas"]):
        return {"canvas": open_canvas, "updated": "open in the Atlas workspace"}
    return None


def _slug(text):
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:48] or "canvas"


def write_export(record, kind, locale="pt"):
    """Write ``<data dir>/exports/<title>-v<n>.<ext>`` atomically and return its path."""
    from ..runtime import data_dir
    canvas = record["canvas"]
    if kind == "html":
        from ..render.html import export_html
        try:
            content = export_html(record, locale=locale)
        except FileNotFoundError as exc:
            raise ToolError("HTML export is unavailable in this installation (viewer asset missing). "
                            "Use format 'markdown' or 'json'.") from exc
        extension = "html"
    elif kind == "markdown":
        from ..render import render_canvas
        content, extension = render_canvas(canvas, locale=locale, revision=record["revision"]) + "\n", "md"
    else:
        content, extension = json.dumps({"atlas": __version__, **record}, ensure_ascii=False, indent=2) + "\n", "json"
    folder = data_dir() / "exports"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{_slug(canvas.get('title', ''))}-{record['id'][-6:]}-v{record['revision']}.{extension}"
    import tempfile  # only exports need it; keep it off the startup path

    handle, temporary = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
    _prune(folder)
    return target


def _prune(folder):
    """Keep the newest EXPORTS_KEPT files. Another process may be pruning the same folder: a file
    that disappears between listing and stat or unlink is simply skipped."""
    dated = []
    for item in folder.iterdir():
        if item.suffix not in {".html", ".md", ".json"}:
            continue
        try:
            if item.is_file():
                dated.append((item.stat().st_mtime, item))
        except OSError:
            continue
    dated.sort(key=lambda pair: pair[0], reverse=True)
    for _, stale in dated[EXPORTS_KEPT:]:
        try:
            stale.unlink()
        except OSError:
            pass


def handlers(ctx, settings):
    """``{tool name: handler}`` ready for ``ctx.register_tool``."""
    box = Toolbox(ctx, settings)
    return {
        "atlas_components": tool(box.components),
        "atlas_render": tool(box.render),
        "atlas_update": tool(box.update),
        "atlas_get": tool(box.get),
        "atlas_list": tool(box.listing),
        "atlas_export": tool(box.export),
        "atlas_resources": tool(box.resources),
    }
