from typing import Annotated

import pytest
from pydantic import Field, TypeAdapter, ValidationError

from atlas.analytics import AnalyticsBlocks, validate_analytics_values


schema = TypeAdapter(Annotated[AnalyticsBlocks, Field(discriminator="type")])
north = {"label": "Norte", "value": 8}
south = {"label": "Sul", "value": 0}
coordinate = {"label": "Porto", "x": -3, "y": 4}
period = {
    "id": "a", "label": "Janeiro",
    "metrics": [{"label": "Saldo", "value": None}, {"label": "Meta", "value": 7, "unit": "kg"}],
    "breakdown": [north, south],
}
examples = {
    "donut": {"items": [north, south]}, "pie": {"items": [north, south]},
    "treemap": {"items": [north, south]}, "funnel": {"items": [north, south]},
    "ranking": {"items": [north, {**south, "value": -6}]},
    "waterfall": {"start": -3, "items": [north, {**south, "value": -6}]},
    "scatter": {"x_label": "x", "y_label": "y", "points": [coordinate]},
    "bubble": {"x_label": "x", "y_label": "y", "points": [{**coordinate, "size": 0}]},
    "radar": {"axes": [{"label": str(i), "value": i, "max": 3} for i in range(3)]},
    "histogram": {"samples": [None, -1, 0, 4.5], "bins": 2},
    "heatmap": {"rows": ["Manhã"], "columns": ["A", "B"], "values": [[None, -1.5]]},
    "gauge": {"min": -20, "max": -5, "value": -5},
    "progress": {"completed": 0, "total": 600},
    "sparkline": {"points": [north, {**south, "value": None}]},
    "dashboard": {"breakdown_label": "Total por região",
                  "periods": [period, {**period, "id": "b", "label": "Fevereiro"}]},
}


def validate(kind, **changes):
    return schema.validate_python({"type": kind, "id": "dataset", "title": "Dados", **examples[kind], **changes})


@pytest.mark.parametrize("kind", examples)
def test_discriminated_round_trip(kind):
    value = validate(kind)
    assert schema.validate_json(value.model_dump_json()) == value
    validate_analytics_values(value, {"view": "table"})


@pytest.mark.parametrize(("kind", "changes"), [
    ("pie", {"items": [{**north, "value": -1}]}),
    ("donut", {"items": [north, north]}),
    ("funnel", {"items": [south, north]}),
    ("treemap", {"items": []}),
    ("scatter", {"points": [{**coordinate, "x": True}]}),
    ("bubble", {"points": [{**coordinate, "size": -1}]}),
    ("radar", {"axes": [{"label": str(i), "value": 4, "max": 2} for i in range(3)]}),
    ("histogram", {"bins": 0}), ("histogram", {"samples": [float("inf")]}),
    ("heatmap", {"values": [[None]]}), ("heatmap", {"values": [[0, 0], [0, 0]]}),
    ("gauge", {"min": 10, "max": 10}), ("gauge", {"value": 999}),
    ("progress", {"total": 0}), ("progress", {"completed": 601}),
    ("sparkline", {"points": [north]}),
    ("dashboard", {"periods": [period, {**period, "id": "b"}]}),
    ("dashboard", {"periods": [period, {**period, "id": "b", "label": "Fev", "metrics": [south]}]}),
])
def test_invalid_inputs(kind, changes):
    with pytest.raises(ValidationError):
        validate(kind, **changes)


def test_persistence_checks_periods_and_chart_highlights():
    dashboard = validate("dashboard")
    validate_analytics_values(dashboard, {"view": "chart", "period": "b"})
    with pytest.raises(ValueError):
        validate_analytics_values(dashboard, {"period": "unknown"})
    validate_analytics_values(validate("bubble"), {"selected": "Porto"})
    validate_analytics_values(validate("pie"), {"selected": ""})
    for kind, key, value in [("gauge", "period", "a"), ("pie", "selected", "Centro"), ("histogram", "view", "list")]:
        with pytest.raises(ValueError):
            validate_analytics_values(validate(kind), {key: value})
