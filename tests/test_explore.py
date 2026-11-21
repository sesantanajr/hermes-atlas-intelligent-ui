import pytest
from pydantic import ValidationError

from atlas.explore import Tabs, Timeline
from atlas.models import Canvas


def item(id):
    return {"id": id, "title": id.title(), "body": "Conteúdo da seção."}


@pytest.mark.parametrize("kind,model", [("timeline", Timeline), ("tabs", Tabs)])
def test_explore_validates_item_identity_and_body(kind, model):
    def parse(items):
        return model.model_validate({"type": kind, "id": "view", "title": "Plano", "items": items})

    assert parse([item("a"), item("b")]).items[1].id == "b"
    for invalid in (
        [item("a"), item("a")],
        [item("a"), {**item("b"), "body": ""}],
        [item("a"), {**item("b"), "body": "x" * 3001}],
        [item("a"), {**item("b"), "blocks": []}],
        [item("a"), {**item("b"), "points": ["a"] * 9}],
    ):
        with pytest.raises(ValidationError):
            parse(invalid)


def test_explore_limits_and_timeline_status_vocabulary():
    common = {"id": "view", "title": "Plano"}
    with pytest.raises(ValidationError):
        Tabs.model_validate({**common, "type": "tabs", "items": [item("a")]})
    with pytest.raises(ValidationError):
        Tabs.model_validate({**common, "type": "tabs", "items": [item(str(i)) for i in range(11)]})
    with pytest.raises(ValidationError):
        Timeline.model_validate({**common, "type": "timeline", "items": [item(str(i)) for i in range(25)]})
    with pytest.raises(ValidationError):
        Timeline.model_validate({**common, "type": "timeline", "items": [{**item("a"), "status": "unsupported"}]})


@pytest.mark.parametrize("kind", ["tabs", "timeline"])
def test_saved_sections_keep_stable_selection_and_reject_unrelated_ids(kind):
    block = {"type": kind, "id": "plan", "title": "Plano", "items": [item("b"), item("a")]}
    payload = {"id": "work", "title": "Mapa", "blocks": [block], "state": {"plan": {"active_item": "a"}}}
    canvas = Canvas.model_validate(payload)
    assert Canvas.model_validate_json(canvas.model_dump_json()).state["plan"].active_item == "a"
    with pytest.raises(ValidationError):
        Canvas.model_validate({**payload, "state": {"plan": {"active_item": "foreign"}}})
