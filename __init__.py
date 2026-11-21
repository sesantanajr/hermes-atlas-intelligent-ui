"""Native Hermes plugin. No network or process side effects on import."""
import json


def register(ctx):
    from .atlas.models import Canvas
    from .atlas.store import Store
    def render(params, **kwargs):
        try:
            canvas = Canvas.model_validate(params["canvas"])
            record = Store().save(canvas)
            return json.dumps({"success": True, "id": record["id"],
                               "revision": record["revision"], "url": "/atlas",
                               "message": "Canvas available in Hermes Atlas."})
        except (ValueError, KeyError) as exc:
            return json.dumps({"success": False, "error": str(exc)[:1500]})

    canvas_schema = Canvas.model_json_schema()
    definitions = canvas_schema.pop("$defs", {})
    ctx.register_tool(name="atlas_render", toolset="atlas", schema={
        "name": "atlas_render",
        "description": "Create an interactive Atlas canvas. Use for visual explanations, tables, charts, comparisons, checklists or calculators. Never fabricate data; label examples. Call again with the same canvas id to create a new revision.",
        "parameters": {"type": "object", "$defs": definitions, "properties": {
            "canvas": canvas_schema}, "required": ["canvas"]}}, handler=render)
    ctx.register_tool(name="atlas_list", toolset="atlas", schema={
        "name": "atlas_list", "description": "List the latest Atlas canvases in the active Hermes profile.",
        "parameters": {"type": "object", "properties": {}}},
        handler=lambda params, **kwargs: json.dumps(Store().list(), ensure_ascii=False))
