"""Validation and editing of canvases on behalf of the agent.

Kept apart from the tool handlers so the same rules serve the API and the tests. The schema
models are imported here, on first use, never when the plugin registers.
"""
import copy
import uuid

from .. import CANVAS_SCHEMA_VERSION


class CanvasError(ValueError):
    """A problem the model can fix; the message is written for it."""


def new_id():
    return "canvas-" + uuid.uuid4().hex


def _path(loc):
    """``('blocks', 2, 'table', 'rows', 0)`` → ``blocks[2].table.rows[0]``."""
    out = ""
    for part in loc:
        out += f"[{part}]" if isinstance(part, int) else ("." if out else "") + str(part)
    return out or "canvas"


def explain(error, limit=8):
    """Turn a pydantic ``ValidationError`` into short, actionable lines."""
    lines = []
    problems = error.errors()
    for problem in problems[:limit]:
        where = _path(problem.get("loc", ()))
        kind = problem.get("type", "")
        if kind == "union_tag_invalid":
            tag = (problem.get("ctx") or {}).get("tag", "?")
            lines.append(f"{where}: unknown block type '{tag}'. Call atlas_components to list the types.")
        elif kind == "union_tag_not_found":
            lines.append(f"{where}: every block needs a 'type'.")
        elif kind == "extra_forbidden":
            lines.append(f"{where}: this field does not exist for the block type. Check atlas_components(type).")
        elif kind == "missing":
            lines.append(f"{where}: required field is missing.")
        else:
            message = str(problem.get("msg", "invalid value")).removeprefix("Value error, ")
            lines.append(f"{where}: {message}")
    if len(problems) > limit:
        lines.append(f"... and {len(problems) - limit} more.")
    return lines


def validate(data):
    """Return a validated ``Canvas`` or raise :class:`CanvasError` listing what to fix."""
    from pydantic import ValidationError

    from ..schema.canvas import Canvas
    if not isinstance(data, dict):
        raise CanvasError("`canvas` must be an object with `title` and `blocks`.")
    try:
        return Canvas.model_validate({"schema_version": CANVAS_SCHEMA_VERSION, **data})
    except ValidationError as error:
        raise CanvasError("Invalid canvas. " + " | ".join(explain(error))) from error


def _index_of(blocks, block_id, operation):
    for index, block in enumerate(blocks):
        if isinstance(block, dict) and block.get("id") == block_id:
            return index
    raise CanvasError(f"operations[{operation}]: no block with id '{block_id}'.")


def _insert(blocks, block, before, operation):
    if before:
        blocks.insert(_index_of(blocks, before, operation), block)
    else:
        blocks.append(block)


def apply_operations(canvas, operations):
    """Apply ``atlas_update`` operations to stored canvas JSON and return the edited copy (unvalidated)."""
    if not isinstance(operations, list) or not operations:
        raise CanvasError("`operations` must be a non-empty list.")
    if len(operations) > 40:
        raise CanvasError("At most 40 operations per call.")
    edited = copy.deepcopy(canvas)
    blocks = edited.setdefault("blocks", [])
    state = edited.get("state") if isinstance(edited.get("state"), dict) else {}
    edited["state"] = state
    for number, operation in enumerate(operations):
        if not isinstance(operation, dict):
            raise CanvasError(f"operations[{number}] must be an object.")
        kind = operation.get("op")
        block = operation.get("block")
        target = operation.get("id")
        if kind in ("add_block", "replace_block"):
            if not isinstance(block, dict) or not isinstance(block.get("id"), str):
                raise CanvasError(f"operations[{number}]: `block` must be a complete block with an id.")
            exists = any(isinstance(b, dict) and b.get("id") == block["id"] for b in blocks)
            if kind == "add_block":
                if exists:
                    raise CanvasError(f"operations[{number}]: block id '{block['id']}' already exists; use replace_block.")
                _insert(blocks, block, operation.get("before"), number)
            else:
                position = _index_of(blocks, block["id"], number)
                if blocks[position].get("type") != block.get("type"):
                    state.pop(block["id"], None)  # state of another block type would not validate
                blocks[position] = block
        elif kind == "remove_block":
            blocks.pop(_index_of(blocks, target, number))
            state.pop(target, None)
        elif kind == "move_block":
            moved = blocks.pop(_index_of(blocks, target, number))
            _insert(blocks, moved, operation.get("before"), number)
        elif kind == "set":
            field = operation.get("field")
            if field not in ("title", "description") or not isinstance(operation.get("text"), str):
                raise CanvasError(f"operations[{number}]: set needs field 'title' or 'description' and a `text`.")
            edited[field] = operation["text"]
        elif kind == "set_sources":
            if not isinstance(operation.get("sources"), list):
                raise CanvasError(f"operations[{number}]: set_sources needs a `sources` list.")
            edited["sources"] = operation["sources"]
        elif kind == "set_state":
            _index_of(blocks, target, number)
            value = operation.get("state")
            if value in (None, {}):
                state.pop(target, None)
            elif isinstance(value, dict):
                state[target] = value
            else:
                raise CanvasError(f"operations[{number}]: `state` must be an object.")
        else:
            raise CanvasError(
                f"operations[{number}]: unknown op '{kind}'. Use add_block, replace_block, remove_block, "
                "move_block, set, set_sources or set_state.")
    if not blocks:
        raise CanvasError("A canvas needs at least one block; remove the canvas in the Atlas library instead.")
    return edited
