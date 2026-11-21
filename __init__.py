"""Native Hermes plugin. No network or process side effects on import."""
import json
from uuid import uuid4


def register(ctx):
    from .atlas.models import Canvas
    from .atlas.store import Store
    def render(params, **kwargs):
        try:
            canvas = Canvas.model_validate(params["canvas"])
            expected = params.get('expected_revision', 0)
            if not isinstance(expected, int) or expected < 0:
                raise ValueError('expected_revision must be a nonnegative integer')
            if expected == 0:
                canvas.id = 'canvas-' + uuid4().hex
            record = Store().save(canvas, expected)
            return json.dumps({"success": True, "id": record["id"],
                               "revision": record["revision"], "url": "/atlas",
                               "message": "Canvas available in Hermes Atlas."})
        except (ValueError, KeyError) as exc:
            return json.dumps({"success": False, "error": str(exc)[:1500]})

    canvas_schema = Canvas.model_json_schema()
    definitions = canvas_schema.pop("$defs", {})
    ctx.register_tool(name="atlas_render", toolset="atlas", schema={
        "name": "atlas_render",
        "description": "Create an interactive Atlas canvas, including safe forms and persistent state. Label examples and cite factual data. A new canvas receives a unique ID. To update, first atlas_get and send its ID with expected_revision equal to the revision you read; stale writes are refused.",
        "parameters": {"type": "object", "$defs": definitions, "properties": {
            "canvas": canvas_schema, "expected_revision": {"type":"integer", "minimum":0, "default":0}}, "required": ["canvas"]}}, handler=render)
    ctx.register_tool(name="atlas_list", toolset="atlas", schema={
        "name": "atlas_list", "description": "List the latest Atlas canvases in the active Hermes profile.",
        "parameters": {"type": "object", "properties": {}}},
        handler=lambda params, **kwargs: json.dumps(Store().list(), ensure_ascii=False))
    ctx.register_tool(name='atlas_get', toolset='atlas', schema={
        'name':'atlas_get', 'description':'Read a saved Atlas canvas, including interaction state and its revision. Use before making a revision.',
        'parameters':{'type':'object','properties':{'id':{'type':'string'},'revision':{'type':'integer','minimum':1}},'required':['id']}},
        handler=lambda params, **kwargs: json.dumps(Store().get(params['id'], params.get('revision')), ensure_ascii=False))
