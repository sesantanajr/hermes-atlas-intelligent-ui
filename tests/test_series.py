import pytest
from pydantic import ValidationError

from atlas.models import Canvas
from atlas.series import SeriesChart


def chart(**patch):
    return {
        "type": "series",
        "id": "trend",
        "title": "Volume",
        "x_axis": "date",
        "labels": ["2026-01-01", "2026-01-03", "2026-02-01"],
        "datasets": [{"id": "net", "label": "Saldo", "values": [-10.5, None, 0]}],
        **patch,
    }


@pytest.mark.parametrize("patch", [
    {"labels": ["2026-01-01", "2026-01-01", "2026-03-01"]},
    {"labels": ["2026-01-01", "2026-01-03", "2025-12-31"]},
    {"labels": ["2026-01-01", "2026-02-29", "2026-03-01"]},
    {"labels": ["20260101", "20260103", "20260201"]},
    {"labels": ["A", "B"], "x_axis": "category"},
    {"datasets": [{"id": "s", "label": "Test", "values": [3, True, 0]}]},
    {"datasets": [{"id": "s", "label": "Test", "values": [3, float("nan"), 0]}]},
    {"datasets": [{"id": "s", "label": "Test", "values": [1, 2, 3]}] * 2},
])
def test_invalid_shapes_and_dates(patch):
    with pytest.raises(ValidationError):
        SeriesChart.model_validate(chart(**patch))


def test_canvas_round_trip_and_state_references():
    payload = {"id": "report", "title": "Período", "blocks": [chart()],
               "state": {"trend": {"hidden_series": ["net"], "series_view": "table"}}}
    saved = Canvas.model_validate(payload)
    assert Canvas.model_validate_json(saved.model_dump_json()) == saved
    assert saved.blocks[0].datasets[0].values == [-10.5, None, 0]
    for ids in [["net", "net"], ["unknown"]]:
        payload["state"]["trend"]["hidden_series"] = ids
        with pytest.raises(ValidationError):
            Canvas.model_validate(payload)
