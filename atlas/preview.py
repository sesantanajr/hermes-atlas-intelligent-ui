"""Read completed blocks from an unfinished Atlas document for display only."""
import json
import re

from .models import Canvas
from .delivery import display_text

_FENCE = re.compile(r"(?m)^```atlas[ \t]*\r?\n")
_SPACE = re.compile(r"[ \r\t\n]*")
_JSON = json.JSONDecoder()
_PREVIEW_LIMIT = 256_000


def _skip(text, position):
    return _SPACE.match(text, position).end()


def _after(text, position, character):
    if not text.startswith(character, position):
        raise ValueError("Incomplete JSON delimiter")
    return _skip(text, position + 1)


def _blocks(text):
    """Walk top-level members with a JSON decoder. Quoted and nested keys are data."""
    position = _after(text, _skip(text, 0), "{")
    title = "Canvas"
    while position < len(text):
        key, position = _JSON.raw_decode(text, position)
        position = _after(text, _skip(text, position), ":")
        if key == "blocks":
            break
        value, position = _JSON.raw_decode(text, position)
        if key == "title" and isinstance(value, str) and 0 < len(value) <= 160:
            title = value
        position = _after(text, _skip(text, position), ",")
    position = _after(text, position, "[")
    blocks = []
    while len(blocks) < 32 and text.startswith("{", position):
        try:
            block, end = _JSON.raw_decode(text, position)
        except json.JSONDecodeError:
            break  # The next block is still arriving.
        blocks.append(block)
        position = _skip(text, end)
        if not text.startswith(",", position):
            break
        position = _after(text, position, ",")
    if blocks:
        return Canvas.model_validate({"id": "live-preview", "title": title, "blocks": blocks})
    return None


def decorate_live(snapshot):
    """Never mutate the persisted text. Finalization still validates the full document."""
    text = snapshot.get("text") or ""
    match = _FENCE.search(text)
    if not match:
        visible = display_text(text, streaming=True)
        return snapshot if visible == text else {**snapshot, 'text': visible}
    public = {**snapshot, "text": display_text(text[:match.start()].rstrip())}
    try:
        canvas = _blocks(text[match.end():match.end() + _PREVIEW_LIMIT])
    except (ValueError, RecursionError):
        return public
    if canvas:
        public["preview"] = canvas.model_dump(mode="json")
    return public
