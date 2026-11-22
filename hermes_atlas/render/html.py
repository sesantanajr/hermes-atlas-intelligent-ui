"""Export a canvas as one self-contained, interactive HTML page.

The page is the real Atlas renderer (built by ``npm run build`` into ``assets/viewer.html``) with
the canvas embedded as inert JSON. It opens offline in any browser, so it is what the agent
attaches on messaging platforms, and what "Export HTML" downloads in the UI.

The template carries each marker exactly once; the canvas is serialised so that no character in
it can close the ``<script type="application/json">`` element it is placed in.
"""
import html
import json
from pathlib import Path

from .. import __version__

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "viewer.html"
DATA_MARKER = "__ATLAS_EXPORT_DATA__"
TITLE_MARKER = "__ATLAS_EXPORT_TITLE__"
LANG_MARKER = "__ATLAS_EXPORT_LANG__"


def embed_json(value):
    """JSON that is safe inside an HTML script element: no ``<``, ``>``, ``&`` or line separators."""
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    for raw, escaped in (("&", "\\u0026"), ("<", "\\u003c"), (">", "\\u003e"),
                         (" ", "\\u2028"), (" ", "\\u2029")):
        text = text.replace(raw, escaped)
    return text


def available():
    return TEMPLATE.is_file()


def export_html(record, *, locale="pt", template=None):
    """The HTML document for a stored canvas record (``{id, revision, updated, canvas}``)."""
    page = template if template is not None else TEMPLATE.read_text(encoding="utf-8")
    for marker in (DATA_MARKER, TITLE_MARKER):
        if page.count(marker) != 1:
            raise ValueError(f"Atlas viewer template must contain {marker} exactly once")
    payload = {"atlas": __version__, "locale": "en" if str(locale).startswith("en") else "pt-BR",
               "id": record["id"], "revision": record["revision"], "updated": record.get("updated", ""),
               "canvas": record["canvas"]}
    title = html.escape(str(record["canvas"].get("title", "Atlas")), quote=True)
    # Each inserted value is placed once and never scanned again, so a canvas whose title or
    # content happens to spell a marker cannot move the data somewhere else in the page.
    head, tail = page.split(DATA_MARKER)
    head, tail = (part.replace(LANG_MARKER, payload["locale"]).replace(TITLE_MARKER, title) for part in (head, tail))
    return head + embed_json(payload) + tail
