"""What the model reads to decide when and how to call Atlas.

Every description is sent with each request, so they are kept short: the full field list of a
block lives in ``atlas_components``, and the workflow lives in the bundled ``atlas-intelligent-ui:canvas``
skill. Standard library only.
"""

TOOLSET = "atlas"

_ID = {"type": "string", "maxLength": 64, "description": "Letters, digits, _ and - only."}
_BLOCK = {
    "type": "object",
    "description": "One UI block. Required: type, id, title. Other fields depend on the type: call atlas_components(type) first.",
    "properties": {"type": {"type": "string"}, "id": _ID, "title": {"type": "string", "maxLength": 160}},
    "required": ["type", "id", "title"],
    "additionalProperties": True,
}
_SOURCES = {
    "type": "array", "maxItems": 20,
    "items": {"type": "object", "properties": {"title": {"type": "string"}, "url": {"type": "string"}},
              "required": ["title", "url"]},
}

COMPONENTS = {
    "name": "atlas_components",
    "description": (
        "Look up the UI blocks an Atlas canvas can contain. With no arguments: the 77 block types "
        "grouped by category with a one-line purpose each. With `type` (or `types`): the exact JSON "
        "schema and a working example of that block. Call this before atlas_render for any block "
        "type you have not used in this conversation."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "maxLength": 64, "description": "One block type, e.g. 'series' or 'budget_planner'."},
            "types": {"type": "array", "maxItems": 6, "items": {"type": "string", "maxLength": 64},
                      "description": "Up to six block types to describe in one call."},
            "q": {"type": "string", "maxLength": 160, "description": "Search text (English or Portuguese), e.g. 'timeline'."},
            "category": {"type": "string", "maxLength": 80,
                         "description": "text, layout, forms, controls, data, media, info, apps or planning."},
        },
    },
}

RENDER = {
    "name": "atlas_render",
    "description": (
        "Create an interactive canvas for the user: charts, tables, forms, checklists, maps, "
        "Gantt charts, calendars, kanban boards and 70+ other blocks, saved in their Atlas library. Use it when "
        "the answer is easier to explore than to read: comparisons, data, plans, study material, "
        "anything the user will tick, filter, adjust or fill in. Blocks are declarative JSON only; "
        "label sample data as such and add `sources` for facts. The result tells you how to show "
        "the canvas in your reply. To change an existing canvas use atlas_update."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "canvas": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "maxLength": 160},
                    "description": {"type": "string", "maxLength": 12000},
                    "blocks": {"type": "array", "minItems": 1, "maxItems": 32, "items": _BLOCK},
                    "state": {"type": "object", "description": "Optional initial interaction state, keyed by block id."},
                    "sources": _SOURCES,
                },
                "required": ["title", "blocks"],
            },
        },
        "required": ["canvas"],
    },
}

UPDATE = {
    "name": "atlas_update",
    "description": (
        "Change a saved canvas without resending it: add, replace, remove or move blocks, or edit "
        "its title, description and sources. Saves a new revision. Read the canvas with atlas_get "
        "first and pass the revision you read as `expected_revision`; a stale revision is refused "
        "so the user's own edits are never overwritten."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": _ID,
            "expected_revision": {"type": "integer", "minimum": 1},
            "operations": {
                "type": "array", "minItems": 1, "maxItems": 40,
                "items": {
                    "type": "object",
                    "properties": {
                        "op": {"type": "string",
                               "enum": ["add_block", "replace_block", "remove_block", "move_block", "set", "set_sources", "set_state"]},
                        "block": {**_BLOCK, "description": "add_block / replace_block: the complete block (replace_block matches it by id)."},
                        "id": {"type": "string", "maxLength": 64, "description": "remove_block / move_block / set_state: the block id."},
                        "before": {"type": "string", "maxLength": 64, "description": "add_block / move_block: insert before this block id (omit to append)."},
                        "field": {"type": "string", "enum": ["title", "description"], "description": "set: which canvas text to change."},
                        "text": {"type": "string", "maxLength": 12000, "description": "set: the new title or description."},
                        "sources": {**_SOURCES, "description": "set_sources: the complete new list of sources."},
                        "state": {"type": "object", "description": "set_state: the block's new interaction state ({} clears it)."},
                    },
                    "required": ["op"],
                },
            },
        },
        "required": ["id", "expected_revision", "operations"],
    },
}

GET = {
    "name": "atlas_get",
    "description": (
        "Read a saved canvas with the user's current interaction state (ticked items, form answers, "
        "selections, edited text and table cells, cards they moved, blocks they reordered, resized or "
        "folded). `view`: 'full' JSON (default), 'outline' (block ids, types and "
        "titles) or 'text' (a Markdown rendering). Use before atlas_update, and whenever the user "
        "refers to something they did on a canvas."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": _ID,
            "revision": {"type": "integer", "minimum": 1, "description": "A specific revision; omit for the latest."},
            "view": {"type": "string", "enum": ["full", "outline", "text"]},
            "blocks": {"type": "array", "maxItems": 32, "items": _ID,
                       "description": "With view 'full': return only these block ids."},
        },
        "required": ["id"],
    },
}

LIST = {
    "name": "atlas_list",
    "description": "Search the user's Atlas library by title, newest first. Returns id, title, revision and update time.",
    "parameters": {
        "type": "object",
        "properties": {
            "q": {"type": "string", "maxLength": 256},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            "offset": {"type": "integer", "minimum": 0},
        },
    },
}

EXPORT = {
    "name": "atlas_export",
    "description": (
        "Write a canvas to a file the user can keep or receive as an attachment: 'html' (one "
        "self-contained interactive page), 'markdown' or 'json'. Returns the file path and a "
        "`media` line; put that line in your reply to deliver the file on messaging platforms."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": _ID,
            "revision": {"type": "integer", "minimum": 1},
            "format": {"type": "string", "enum": ["html", "markdown", "json"]},
        },
        "required": ["id"],
    },
}

RESOURCES = {
    "name": "atlas_resources",
    "description": (
        "Measure the machine Hermes runs on: free and used disk, available memory, swap, load "
        "averages and CPU count. Read-only and instant (OS counters, no directory scan). Use it "
        "for server or VPS capacity questions."
    ),
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}

ALL = (COMPONENTS, RENDER, UPDATE, GET, LIST, EXPORT, RESOURCES)
NAMES = tuple(schema["name"] for schema in ALL)
