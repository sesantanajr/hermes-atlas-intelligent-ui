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

    from .atlas import catalog
    from .atlas.resources import snapshot

    ctx.register_tool(name='atlas_resources', toolset='atlas', schema={
        'name':'atlas_resources',
        'description':'Measure current disk space, available RAM, swap and load averages of the system running Hermes. Use this read-only snapshot for VPS capacity questions. It samples OS counters without scanning directories.',
        'parameters':{'type':'object','properties':{},'additionalProperties':False}},
        handler=lambda params, **kwargs: json.dumps(snapshot()))

    def discover(params, **kwargs):
        try:
            kind, query, category = (params.get(k, '') for k in ('type','q','category'))
            if any(not isinstance(s, str) for s in (kind,query,category)) or len(kind)>64 or len(query)>160 or len(category)>80:
                raise ValueError('Invalid catalog parameters')
            result = catalog.detail(kind) if kind else catalog.search(query, category)
            return json.dumps(result, ensure_ascii=False)
        except (KeyError, ValueError) as exc:
            return json.dumps({'success':False,'error':str(exc)})

    ctx.register_tool(name='atlas_components',toolset='atlas',schema={
        'name':'atlas_components','description':'Discover supported UI blocks by type, Portuguese label or category. Pass type for the full JSON schema and a working example before rendering.',
        'parameters':{'type':'object','properties':{'type':{'type':'string','maxLength':64},'q':{'type':'string','maxLength':160},'category':{'type':'string','maxLength':80}}}},handler=discover)
    canvas_schema = {'type':'object','properties':{
        'id':{'type':'string'},'title':{'type':'string'},'description':{'type':'string'},
        'schema_version':{'type':'string','enum':['1.0']},'state':{'type':'object'},
        'sources':{'type':'array','items':{'type':'object','properties':{'title':{'type':'string'},'url':{'type':'string'}},'required':['title','url']}},
        'blocks':{'type':'array','minItems':1,'maxItems':32,'items':{'type':'object','description':'Use atlas_components(type) for required fields.','properties':{'type':{'type':'string'},'id':{'type':'string'},'title':{'type':'string'}},'required':['type','id','title'],'additionalProperties':True}}},
        'required':['id','title','blocks']}
    ctx.register_tool(name="atlas_render", toolset="atlas", schema={
        "name": "atlas_render",
        "description": "Create an interactive Atlas canvas, including safe forms and persistent state. Label examples and cite factual data. A new canvas receives a unique ID. To update, first atlas_get and send its ID with expected_revision equal to the revision you read; stale writes are refused.",
        "parameters": {"type": "object", "properties": {
            "canvas": canvas_schema, "expected_revision": {"type":"integer", "minimum":0, "default":0}}, "required": ["canvas"]}}, handler=render)
    def list_canvases(params, **kwargs):
        offset = params.get('offset', 0)
        limit = params.get('limit', 100)
        query = params.get('q', '')
        if (type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not isinstance(query, str) or len(query) > 256):
            return json.dumps({'success': False, 'error': 'Invalid search or pagination parameters.'})
        return json.dumps(Store().list(offset, limit, query), ensure_ascii=False)

    ctx.register_tool(name="atlas_list", toolset="atlas", schema={
        "name": "atlas_list", "description": "Search Atlas canvases by title or list the latest saved canvases in the active profile.",
        "parameters": {"type": "object", "properties": {
            "q": {"type": "string", "maxLength": 256}, "offset": {"type": "integer", "minimum": 0},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100}}}},
        handler=list_canvases)
    ctx.register_tool(name='atlas_get', toolset='atlas', schema={
        'name':'atlas_get', 'description':'Read a saved Atlas canvas, including interaction state and its revision. Use before making a revision.',
        'parameters':{'type':'object','properties':{'id':{'type':'string'},'revision':{'type':'integer','minimum':1}},'required':['id']}},
        handler=lambda params, **kwargs: json.dumps(Store().get(params['id'], params.get('revision')), ensure_ascii=False))
