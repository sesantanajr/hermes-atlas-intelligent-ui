import json
from typing import Annotated

import pytest
from pydantic import Field, TypeAdapter, ValidationError

from atlas.controls import ControlBlocks

adapter = TypeAdapter(Annotated[ControlBlocks, Field(discriminator="type")])
options = [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]
groups = [{"id": "g", "label": "Grupo", "tasks": options}]


def control(kind, **fields):
    return adapter.validate_python({"id": "block", "type": kind, "title": "Teste", **fields})


@pytest.mark.parametrize(("kind", "fields", "state"), [
    ("short_answer", {}, {"value": "Café"}),
    ("long_answer", {}, {"value": "a" * 4000}),
    ("number_input", {"min": 0, "max": 12}, {"value": "2.125"}),
    ("date_picker", {}, {"value": "2028-02-29"}),
    ("date_range", {}, {"start": "2028-02-29", "end": ""}),
    ("single_choice", {"options": options}, {"value": "a"}),
    ("multi_choice", {"options": options}, {"selected": '["a","b"]'}),
    ("toggle", {}, {"value": "false"}),
    ("slider", {"min": -1, "max": 2, "step": .1}, {"value": "-0.7"}),
    ("rating", {"stars": 3}, {"value": "3"}),
    ("segmented", {"options": options}, {"value": "b"}),
    ("checklist_group", {"groups": groups}, {"selected": '["a"]'}),
    ("poll", {"options": options}, {"choice": "a", "vote": "a"}),
    ("quiz", {"options": options, "question": "Q?", "answer_id": "b", "explanation": "B."},
     {"choice": "a", "answer": "a"}),
    ("timer", {"seconds": 3600}, {"remaining_ms": "3599200"}),
])
def test_control_state_roundtrip(kind, fields, state):
    block = control(kind, **fields)
    restored = adapter.validate_json(block.model_dump_json())
    restored.validate_values(json.loads(json.dumps(state)))
    restored.validate_values(None)
    with pytest.raises(ValueError):
        restored.validate_values({"other": "a"})


@pytest.mark.parametrize(("kind", "fields", "state"), [
    ("short_answer", {}, {"value": "s"*241}),
    ("long_answer", {}, {"value": "s"*4001}),
    ("number_input", {}, {"value": "nan"}),
    ("date_picker", {}, {"value": "2026-02-29"}),
    ("date_range", {}, {"end": "2026-1-2"}),
    ("single_choice", {"options": options}, {"value": "x"}),
    ("multi_choice", {"options": options}, {"selected": '["a","a"]'}),
    ("multi_choice", {"options": options}, {"selected": '{"a":true}'}),
    ("toggle", {}, {"value": "on"}),
    ("slider", {"min": 0, "max": 1, "step": .1}, {"value": "0.15"}),
    ("rating", {"stars": 3}, {"value": "4"}),
    ("segmented", {"options": options}, {"value": "label A"}),
    ("checklist_group", {"groups": groups}, {"selected": '["x"]'}),
    ("poll", {"options": options}, {"choice": "a", "vote": "b"}),
    ("quiz", {"options": options, "question": "Q?", "answer_id": "b", "explanation": "B."},
     {"choice": "a", "answer": "b"}),
    ("timer", {"seconds": 3}, {"remaining_ms": "3001"}),
    ("timer", {"seconds": 3}, {"remaining_ms": "123", "deadline_ms": "123"}),
])
def test_rejects_invalid_control_state(kind, fields, state):
    with pytest.raises(ValueError):
        control(kind, **fields).validate_values(state)


@pytest.mark.parametrize(("kind", "fields"), [
    ("number_input", {"min": 2, "max": 1}),
    ("date_picker", {"earliest": "2026-10-01", "latest": "2025-10-01"}),
    ("date_range", {"earliest": "2026-02-31"}),
    ("multi_choice", {"options": [options[0], options[0]]}),
    ("slider", {"min": 4, "max": 4}),
    ("slider", {"min": .3, "max": 1, "step": .2, "initial": .4}),
    ("checklist_group", {"groups": [*groups, {"id": "h", "label": "2", "tasks": [options[0]]}]}),
    ("quiz", {"options": options, "question": "?", "answer_id": "x", "explanation": "B."}),
    ("timer", {"seconds": 0}),
])
def test_rejects_incoherent_control_declarations(kind, fields):
    with pytest.raises(ValidationError):
        control(kind, **fields)


def test_checklist_with_long_identifiers_always_fits_saved_interaction():
    long_groups = [{"id": str(g), "label": "Grupo", "tasks": [
        {"id": f"{g}-{i}".ljust(64, "x"), "label": "Tarefa"} for i in range(24)
    ]} for g in range(3)]
    with pytest.raises(ValidationError):
        control("checklist_group", groups=long_groups)
    control("checklist_group", groups=long_groups[:2])
