import pytest
from pydantic import ValidationError
from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.server.preview import decorate_live
import json

def block(kind="diagram"):
    detail = {"id": "one", "title": "A", "body": "Detalhe"}
    if kind == "diagram":
        return {"type": kind, "id":"b", "title":"Imagem", "alt":"Figura",
                "items":[dict(detail, x=10, y=40)]}
    return {"type":kind,"id":"b","title":"Percurso","items":[dict(detail,lat=0,lon=179),
            dict(detail, id="two",lat=1,lon=-179)]}

@pytest.mark.parametrize("kind", ["route","diagram"])
def test_spatial_state_survives_roundtrip_and_progressive_render(kind):
    item = block(kind)
    canvas = Canvas.model_validate({"id":"test","title":"Demo","blocks":[item],"state":{"b":{"active_item":"one"}}})
    assert Canvas.model_validate_json(canvas.model_dump_json()) == canvas
    prefix = '```atlas\n{"blocks":[' + json.dumps(item) + ',{"id":'
    assert decorate_live({"text":prefix})["preview"]["blocks"][0]["type"] == kind
    with pytest.raises(ValidationError):
        Canvas.model_validate({"id":"test","title":"Demo","blocks":[item],"state":{"b":{"active_item":"absent"}}})

@pytest.mark.parametrize("field,value", [("x",100.01),("y",-1)])
def test_diagram_rejects_off_canvas_pin(field,value):
    item = block()
    item["items"][0][field] = value
    with pytest.raises(ValidationError):
        Canvas.model_validate({"id":"test","title":"Demo","blocks":[item]})

@pytest.mark.parametrize("url", ["http://example.org/a.jpg","https://user:pass@example.org/a.jpg"])
def test_diagram_image_requires_https_and_no_credentials(url):
    with pytest.raises(ValidationError):
        Canvas.model_validate({"id":"test","title":"Demo","blocks":[dict(block(),image_url=url)]})

def test_route_rejects_invalid_coordinate_and_duplicate_stop():
    for update in [{"lat":91},{"lon":190},{"id":"one"}]:
        item = block("route")
        item["items"][1].update(update)
        with pytest.raises(ValidationError):
            Canvas.model_validate({"id":"test","title":"Demo","blocks":[item]})
