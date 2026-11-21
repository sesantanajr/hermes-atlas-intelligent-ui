from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, HttpUrl

Text = Annotated[str, Field(max_length=12000)]
Label = Annotated[str, Field(min_length=1, max_length=160)]
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Number = Annotated[float, Field(allow_inf_nan=False, ge=-1e12, le=1e12)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Block(Strict):
    id: Identifier
    title: Label


class TextBlock(Block):
    type: Literal["text"]
    text: Text


class Metric(Block):
    type: Literal["metric"]
    value: Label
    detail: Text = ""


class Point(Strict):
    label: Label
    value: Number


class Chart(Block):
    type: Literal["chart"]
    unit: Annotated[str, Field(max_length=30)] = ""
    points: Annotated[list[Point], Field(min_length=1, max_length=40)]


class Table(Block):
    type: Literal["table"]
    columns: Annotated[list[Label], Field(min_length=1, max_length=12)]
    rows: Annotated[list[list[Text]], Field(max_length=200)]

    @model_validator(mode="after")
    def rectangular(self):
        if any(len(row) != len(self.columns) for row in self.rows):
            raise ValueError("Every row must match the column count")
        return self


class Checklist(Block):
    type: Literal["checklist"]
    items: Annotated[list[Label], Field(min_length=1, max_length=40)]


class Option(Strict):
    name: Label
    description: Text
    features: Annotated[list[Label], Field(max_length=12)]


class Comparison(Block):
    type: Literal["comparison"]
    options: Annotated[list[Option], Field(min_length=2, max_length=4)]


class Input(Strict):
    label: Label
    value: Number
    min: Number = 0
    max: Number = 100
    step: Annotated[float, Field(gt=0, le=1e12, allow_inf_nan=False)] = 1

    @model_validator(mode="after")
    def bounds(self):
        if not self.min <= self.value <= self.max or self.min == self.max:
            raise ValueError("Input requires min <= value <= max and min < max")
        return self


class Calculator(Block):
    type: Literal["calculator"]
    operation: Literal["sum", "product", "split", "compound"]
    inputs: Annotated[list[Input], Field(min_length=2, max_length=6)]
    unit: Annotated[str, Field(max_length=30)] = ""

    @model_validator(mode="after")
    def arity(self):
        if self.operation == "compound" and len(self.inputs) != 3:
            raise ValueError("compound requires principal, annual percent and years, in order")
        if self.operation == "split" and len(self.inputs) != 2:
            raise ValueError("split requires total and people, in order")
        return self


class FormField(Strict):
    id: Identifier
    label: Label
    kind: Literal["text", "number", "select"] = "text"
    options: Annotated[list[Label], Field(max_length=30)] = []
    required: bool = False

    @model_validator(mode="after")
    def valid_options(self):
        if self.kind == "select" and not self.options:
            raise ValueError("Select needs options")
        return self


class Form(Block):
    type: Literal["form"]
    fields: Annotated[list[FormField], Field(min_length=1, max_length=12)]
    submit_label: Label = "Enviar ao Hermes"

    @model_validator(mode="after")
    def unique_fields(self):
        if len({f.id for f in self.fields}) != len(self.fields):
            raise ValueError("Form field ids must be unique")
        return self


class Interaction(Strict):
    checked: Annotated[list[Annotated[int, Field(ge=0, le=39)]], Field(max_length=40)] = []
    selected: Annotated[int | None, Field(ge=0, le=3)] = None
    query: Annotated[str, Field(max_length=300)] = ""
    sort_column: Annotated[int | None, Field(ge=0, le=11)] = None
    sort_reverse: bool = False
    fields: dict[Identifier, Annotated[str, Field(max_length=4000)]] = {}


class Source(Strict):
    title: Label
    url: HttpUrl


Component = Annotated[TextBlock | Metric | Chart | Table | Checklist | Comparison | Calculator | Form, Field(discriminator="type")]


class Canvas(Strict):
    schema_version: Literal["1.0"] = "1.0"
    id: Identifier
    title: Label
    description: Text = ""
    blocks: Annotated[list[Component], Field(min_length=1, max_length=32)]
    state: dict[Identifier, Interaction] = {}
    sources: Annotated[list[Source], Field(max_length=20)] = []

    @model_validator(mode="after")
    def unique_ids(self):
        if len({block.id for block in self.blocks}) != len(self.blocks):
            raise ValueError("Block ids must be unique")
        if not set(self.state).issubset({b.id for b in self.blocks}):
            raise ValueError("State must reference an existing block")
        if any(len(s.fields) > 12 for s in self.state.values()):
            raise ValueError("Too many field values")
        return self
