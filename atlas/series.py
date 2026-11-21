"""A bounded, aligned data matrix for category and date charts."""

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .block_base import Block, Identifier, Label, Number, Strict


class Dataset(Strict):
    id: Identifier
    label: Label
    values: Annotated[list[Annotated[Number, Field(strict=True)] | None], Field(min_length=1, max_length=60)]


class SeriesChart(Block):
    type: Literal["series"]
    kind: Literal["line", "bar", "area"] = "line"
    x_axis: Literal["category", "date"] = "category"
    labels: Annotated[list[Label], Field(min_length=1, max_length=60)]
    datasets: Annotated[list[Dataset], Field(min_length=1, max_length=6)]
    unit: Annotated[str, Field(max_length=30)] = ""

    @model_validator(mode="after")
    def aligned(self):
        if len(set(self.labels)) != len(self.labels):
            raise ValueError("Chart labels must be unique")
        if len({series.id for series in self.datasets}) != len(self.datasets):
            raise ValueError("Dataset ids must be unique")
        if len({series.label for series in self.datasets}) != len(self.datasets):
            raise ValueError("Dataset labels must be unique")
        if any(len(series.values) != len(self.labels) for series in self.datasets):
            raise ValueError("Each label needs one value or null in every dataset")
        if self.x_axis == "date":
            if any(date.fromisoformat(label).isoformat() != label for label in self.labels):
                raise ValueError("Date axes require ISO dates in YYYY-MM-DD format")
            if self.labels != sorted(self.labels):
                raise ValueError("Date axes require chronological labels")
        return self

    def validate_hidden(self, hidden: list[str]):
        ids = set(hidden)
        if len(ids) != len(hidden) or not ids.issubset(series.id for series in self.datasets):
            raise ValueError("Hidden series must name unique datasets in this block")
