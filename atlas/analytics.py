"""Validated shapes for quantitative blocks and period-filtered dashboards."""
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .block_base import Block, Identifier, Label, Number, Strict

Value = Annotated[Number, Field(strict=True)]
Nonnegative = Annotated[Value, Field(ge=0)]
Positive = Annotated[Value, Field(gt=0)]
Unit = Annotated[str, Field(max_length=30)]


def distinct(labels):
    if len(labels) != len(set(labels)):
        raise ValueError("Labels must be distinct within a dataset")


class Amount(Strict):
    label: Label
    value: Value


class Portion(Amount):
    value: Nonnegative


class QuantityBlock(Block):
    unit: Unit = ""


class Portions(QuantityBlock):
    items: Annotated[list[Portion], Field(min_length=1, max_length=24)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([item.label for item in self.items])
        return self


class Pie(Portions):
    type: Literal["pie"]


class Donut(Portions):
    type: Literal["donut"]


class Treemap(Portions):
    type: Literal["treemap"]


class Funnel(Portions):
    type: Literal["funnel"]

    @model_validator(mode="after")
    def successive_stages(self):
        if any(b.value > a.value for a, b in zip(self.items, self.items[1:])):
            raise ValueError("Each funnel stage must be a subset of the previous stage")
        return self


class SignedItems(QuantityBlock):
    items: Annotated[list[Amount], Field(min_length=1, max_length=40)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([item.label for item in self.items])
        return self


class Waterfall(SignedItems):
    type: Literal["waterfall"]
    start: Value = 0


class Ranking(SignedItems):
    type: Literal["ranking"]


class Coordinate(Strict):
    label: Label
    x: Value
    y: Value


class SizedCoordinate(Coordinate):
    size: Nonnegative


class Axes(Block):
    x_label: Label
    y_label: Label


class Scatter(Axes):
    type: Literal["scatter"]
    points: Annotated[list[Coordinate], Field(min_length=1, max_length=120)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([p.label for p in self.points])
        return self


class Bubble(Axes):
    type: Literal["bubble"]
    points: Annotated[list[SizedCoordinate], Field(min_length=1, max_length=80)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([p.label for p in self.points])
        return self


class Axis(Strict):
    label: Label
    value: Nonnegative
    max: Positive

    @model_validator(mode="after")
    def in_range(self):
        if self.value > self.max:
            raise ValueError("Radar value exceeds its axis maximum")
        return self


class Radar(Block):
    type: Literal["radar"]
    axes: Annotated[list[Axis], Field(min_length=3, max_length=12)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([a.label for a in self.axes])
        return self


class Heatmap(QuantityBlock):
    type: Literal["heatmap"]
    rows: Annotated[list[Label], Field(min_length=1, max_length=24)]
    columns: Annotated[list[Label], Field(min_length=1, max_length=24)]
    values: Annotated[list[Annotated[list[Value | None], Field(max_length=24)]], Field(max_length=24)]

    @model_validator(mode="after")
    def valid_matrix(self):
        distinct(self.rows)
        distinct(self.columns)
        if len(self.values) != len(self.rows) or any(len(row) != len(self.columns) for row in self.values):
            raise ValueError("Heatmap values must match both dimensions")
        return self


class Histogram(QuantityBlock):
    type: Literal["histogram"]
    samples: Annotated[list[Value | None], Field(min_length=1, max_length=1000)]
    bins: Annotated[int, Field(strict=True, ge=1, le=24)] = 8


class Gauge(QuantityBlock):
    type: Literal["gauge"]
    min: Value = 0
    max: Value = 100
    value: Value

    @model_validator(mode="after")
    def valid_range(self):
        if self.min >= self.max or not self.min <= self.value <= self.max:
            raise ValueError("Gauge requires min <= value <= max and min < max")
        return self


class Progress(QuantityBlock):
    type: Literal["progress"]
    completed: Nonnegative
    total: Positive

    @model_validator(mode="after")
    def valid_range(self):
        if self.completed > self.total:
            raise ValueError("Completed amount exceeds the total")
        return self


class Reading(Strict):
    label: Label
    value: Value | None


class Sparkline(QuantityBlock):
    type: Literal["sparkline"]
    points: Annotated[list[Reading], Field(min_length=2, max_length=80)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([p.label for p in self.points])
        return self


class DashboardMetric(Reading):
    unit: Unit = ""


class DashboardPeriod(Strict):
    id: Identifier
    label: Label
    metrics: Annotated[list[DashboardMetric], Field(min_length=1, max_length=8)]
    breakdown: Annotated[list[Portion], Field(min_length=1, max_length=24)]

    @model_validator(mode="after")
    def valid_labels(self):
        distinct([m.label for m in self.metrics])
        distinct([p.label for p in self.breakdown])
        return self


class Dashboard(QuantityBlock):
    type: Literal["dashboard"]
    breakdown_label: Label
    periods: Annotated[list[DashboardPeriod], Field(min_length=2, max_length=16)]

    @model_validator(mode="after")
    def valid_periods(self):
        distinct([p.id for p in self.periods])
        distinct([p.label for p in self.periods])
        expected = {(m.label, m.unit) for m in self.periods[0].metrics}
        if any({(m.label, m.unit) for m in p.metrics} != expected for p in self.periods):
            raise ValueError("Use the same metric labels and units in every period")
        return self


AnalyticsBlocks = (Pie | Donut | Treemap | Funnel | Waterfall | Ranking | Scatter | Bubble |
                   Radar | Heatmap | Histogram | Gauge | Progress | Sparkline | Dashboard)


def validate_analytics_values(block: AnalyticsBlocks, values: dict[str, str]) -> None:
    allowed = {"view": {"chart", "table"}}
    if isinstance(block, Dashboard):
        allowed["period"] = {period.id for period in block.periods}
    if isinstance(block, (Pie, Donut, Treemap)):
        allowed["selected"] = {"", *(item.label for item in block.items)}
    if isinstance(block, (Scatter, Bubble)):
        allowed["selected"] = {"", *(point.label for point in block.points)}
    if any(key not in allowed or value not in allowed[key] for key, value in values.items()):
        raise ValueError("Invalid analytics selection")
