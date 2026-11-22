"""The inline-canvas directive: ``::atlas{id="canvas-..." rev="3"}``.

One line of text is all it takes to place a saved canvas in a reply. Hermes Desktop hands the
directive to the Atlas extension (its transcript-directive contract: ``::name{key="value"}``),
and the Atlas chat resolves it on the server. The grammar below accepts what the Desktop parser
accepts for our name: double or single quotes, ``rev`` optional, attributes in either order.
"""
import re

NAME = "atlas"
_ID = r"[A-Za-z0-9_-]{1,64}"
_ATTR = re.compile(r"""([a-z][\w-]{0,63})=(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)
PATTERN = re.compile(r"(?:(?<=\s)|^)::atlas\{([^{}\n]{0,2048})\}", re.MULTILINE)


def directive(canvas_id, revision=None):
    rev = f' rev="{revision}"' if revision else ""
    return f'::{NAME}{{id="{canvas_id}"{rev}}}'


def find(text):
    """``[{id, revision, start, end}]`` for each well-formed Atlas directive in *text*, in order."""
    found = []
    for match in PATTERN.finditer(text or ""):
        attrs = {m.group(1).lower(): m.group(2) if m.group(2) is not None else m.group(3)
                 for m in _ATTR.finditer(match.group(1))}
        canvas_id = attrs.get("id", "")
        if not re.fullmatch(_ID, canvas_id):
            continue
        rev = attrs.get("rev", "")
        found.append({"id": canvas_id, "revision": int(rev) if rev.isdigit() and 0 < int(rev) < 10**9 else None,
                      "start": match.start(), "end": match.end()})
    return found


def strip(text, spans):
    """*text* without the given directive spans, with the blank lines they leave behind collapsed."""
    out, cursor = [], 0
    for span in sorted(spans, key=lambda s: s["start"]):
        out.append(text[cursor:span["start"]])
        cursor = span["end"]
    out.append(text[cursor:])
    return re.sub(r"\n{3,}", "\n\n", "".join(out)).strip("\r\n").rstrip()
