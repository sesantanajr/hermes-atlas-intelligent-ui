"""1.1.2: planning blocks (gantt, calendar, matrix, tree), layout state and edited table cells."""
import pytest
from pydantic import ValidationError

from hermes_atlas.render import render_canvas
from hermes_atlas.schema.canvas import Canvas

GANTT = {"type": "gantt", "id": "g", "title": "Cronograma", "tasks": [
    {"id": "a", "label": "Levantamento", "start": "2026-12-01", "end": "2026-12-05", "progress": 100, "group": "Fase 1"},
    {"id": "b", "label": "Go-live", "start": "2026-12-10", "end": "2026-12-10", "milestone": True, "depends_on": ["a"]}]}
CALENDAR = {"type": "calendar", "id": "c", "title": "Agenda", "month": "2026-12", "events": [
    {"id": "e1", "label": "Reunião", "date": "2026-12-02", "time": "10:00", "tone": "info"},
    {"id": "e2", "label": "Viagem", "date": "2026-12-20", "end": "2026-12-23"}]}
MATRIX = {"type": "matrix", "id": "m", "title": "Prioridades", "x_axis": "Urgência", "y_axis": "Importância",
          "quadrants": [{"id": q, "label": q.upper()} for q in ("q1", "q2", "q3", "q4")],
          "items": [{"id": "i1", "label": "Backup", "quadrant": "q1"}, {"id": "i2", "label": "Wiki", "quadrant": "q4"}]}
TREE = {"type": "tree", "id": "t", "title": "Estrutura", "nodes": [
    {"id": "r", "label": "Projeto"}, {"id": "n1", "label": "Infra", "parent": "r"},
    {"id": "n2", "label": "Rede", "parent": "n1", "detail": "VLANs"}]}
TABLE = {"type": "table", "id": "tb", "title": "Custos", "columns": ["Item", "Valor"],
         "rows": [["A", "R$ 10,00"], ["B", "R$ 5,50"]]}


def canvas(*blocks, state=None):
    return Canvas.model_validate({"id": "x", "title": "Plano", "blocks": list(blocks), "state": state or {}})


def test_planning_blocks_validate_and_render_as_text():
    text = render_canvas(canvas(GANTT, CALENDAR, MATRIX, TREE).model_dump(mode="json"))
    assert "| Levantamento | Fase 1 | 2026-12-01 → 2026-12-05 | 100% |" in text
    assert "marco; depende de Levantamento" in text
    assert "- 2026-12-02 10:00: **Reunião**" in text and "- 2026-12-20 → 2026-12-23: **Viagem**" in text
    assert "*Importância × Urgência*" in text and "**Q1**\n- Backup" in text
    assert "- Projeto\n  - Infra\n    - Rede — VLANs" in text


@pytest.mark.parametrize("block, error", [
    ({**GANTT, "tasks": [{**GANTT["tasks"][0], "end": "2026-11-01"}]}, "ends before it starts"),
    ({**GANTT, "tasks": [{**GANTT["tasks"][0], "start": "2026-W48-1", "end": "2026-12-01"}]}, "pattern"),
    ({**GANTT, "tasks": [{**GANTT["tasks"][1], "end": "2026-12-11"}]}, "same day"),
    ({**GANTT, "tasks": [{**GANTT["tasks"][0], "depends_on": ["zz"]}]}, "unknown task"),
    ({**GANTT, "tasks": [{**GANTT["tasks"][0], "start": "2026-02-30", "end": "2026-03-01"}]}, "ISO date"),
    ({**CALENDAR, "month": "2026-13"}, "ISO date"),
    ({**CALENDAR, "events": [{"id": "e", "label": "x", "date": "2026-12-02", "time": "25:00"}]}, "pattern"),
    ({**MATRIX, "quadrants": MATRIX["quadrants"][:3]}, "at least 4"),
    ({**MATRIX, "items": [{"id": "i", "label": "x", "quadrant": "nope"}]}, "existing quadrant"),
    ({**TREE, "nodes": TREE["nodes"] + [{"id": "r2", "label": "Outra raiz"}]}, "exactly one root"),
    ({**TREE, "nodes": [{"id": "a", "label": "A", "parent": "b"}, {"id": "b", "label": "B", "parent": "a"},
                        {"id": "r", "label": "R"}]}, "cycle"),
])
def test_planning_blocks_refuse_incoherent_data(block, error):
    with pytest.raises(ValidationError) as info:
        canvas(block)
    assert error in str(info.value)


def test_planning_state_is_checked_against_the_block():
    ok = canvas(GANTT, CALENDAR, MATRIX, TREE, state={
        "g": {"values": {"task": "b", "scale": "month"}},
        "c": {"values": {"month": "2027-01", "event": "e2"}},
        "m": {"values": {"i1": "q2"}},
        "t": {"values": {"n1": "closed"}}})
    text = render_canvas(ok.model_dump(mode="json"))
    assert "**Q2**\n- Backup" in text and "- Infra (recolhido)" in text
    for block, values in ((GANTT, {"scale": "year"}), (CALENDAR, {"month": "2027-13"}), (MATRIX, {"i1": "q9"}),
                          (TREE, {"n1": "open"}), (TREE, {"zz": "closed"})):
        with pytest.raises(ValidationError):
            canvas(block, state={block["id"]: {"values": values}})


def test_layout_and_edited_cells_are_part_of_the_state():
    ok = canvas(TABLE, MATRIX, state={"tb": {"cells": {"1:1": "R$ 7,00"}, "width": "half", "collapsed": True}})
    assert ok.state["tb"].width == "half" and ok.state["tb"].collapsed
    assert "| B | R$ 7,00 (editado) |" in render_canvas(ok.model_dump(mode="json"))
    with pytest.raises(ValidationError):
        canvas(TABLE, state={"tb": {"cells": {"5:0": "fora"}}})
    with pytest.raises(ValidationError):
        canvas(TABLE, MATRIX, state={"m": {"cells": {"0:0": "não é tabela"}}})
    with pytest.raises(ValidationError):
        canvas(TABLE, state={"tb": {"width": "triple"}})
