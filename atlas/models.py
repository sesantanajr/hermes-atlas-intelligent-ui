from typing import Annotated, Literal
from pydantic import Field, field_validator, model_validator, HttpUrl
from .block_base import Strict, Block, Text, Label, Identifier, Number
from .series import SeriesChart
from .explore import Tabs, Timeline
from .spatial import Diagram, Route
from .study import Flashcards
from .controls import ControlBlocks, Control
from .analytics import AnalyticsBlocks, validate_analytics_values
from .editorial import EditorialBlocks, validate_editorial_state
from .experience import ExperienceBlocks, validate_experience_state


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


class Source(Strict):
    title: Label
    url: HttpUrl


class CollectionItem(Strict):
    id: Identifier
    title: Label
    description: Annotated[str, Field(max_length=1000)] = ""
    metadata: Annotated[dict[Label, Label], Field(max_length=8)] = {}
    score: Annotated[float | None, Field(ge=0, le=100, allow_inf_nan=False)] = None
    source: Source | None = None
    image_url: HttpUrl | None = None
    illustration: Literal["coast", "orbit", "rain", "dining"] | None = None

    @field_validator("image_url")
    @classmethod
    def https_image(cls, url):
        if url and (url.scheme != "https" or url.username or url.password):
            raise ValueError("Images require an HTTPS URL without credentials")
        return url


class Collection(Block):
    type: Literal["collection"]
    items: Annotated[list[CollectionItem], Field(min_length=1, max_length=24)]

    @model_validator(mode="after")
    def unique_items(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Collection item ids must be unique")
        return self


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
    kind: Literal["text", "number", "select", "date", "textarea", "checkbox", "radio"] = "text"
    options: Annotated[list[Label], Field(max_length=30)] = []
    required: bool = False

    @model_validator(mode="after")
    def valid_options(self):
        if self.kind in {"select", "radio"} and not self.options:
            raise ValueError("Choice fields need options")
        if self.kind == "radio" and len(set(self.options)) != len(self.options):
            raise ValueError("Choice fields need distinct options")
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
    values: Annotated[dict[Identifier, Annotated[str, Field(max_length=4000)]], Field(max_length=64)] = {}
    checked: Annotated[list[Annotated[int, Field(ge=0, le=39)]], Field(max_length=40)] = []
    selected: Annotated[int | None, Field(ge=0, le=3)] = None
    query: Annotated[str, Field(max_length=300)] = ""
    sort_column: Annotated[int | None, Field(ge=0, le=11)] = None
    sort_reverse: bool = False
    fields: dict[Identifier, Annotated[str, Field(max_length=4000)]] = {}
    selected_ids: Annotated[list[Identifier], Field(max_length=4)] = []
    collection_sort: Literal["original", "score", "title"] = "original"
    active_item: Identifier | None = None
    hidden_series: Annotated[list[Identifier], Field(max_length=6)] = []
    known_ids: Annotated[list[Identifier], Field(max_length=40)] = []
    series_view: Literal["plot", "table"] = "plot"


Component = Annotated[TextBlock | Metric | Chart | Table | Checklist | Comparison | Calculator | Form |
                      Collection | SeriesChart | Tabs | Timeline | Route | Diagram | Flashcards |
                      ControlBlocks | AnalyticsBlocks | EditorialBlocks | ExperienceBlocks, Field(discriminator="type")]


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
        for block in self.blocks:
            interaction = self.state.get(block.id)
            if not interaction:
                continue
            if isinstance(block, Control):
                block.validate_values(interaction.values)
            elif isinstance(block, AnalyticsBlocks):
                validate_analytics_values(block, interaction.values)
            elif isinstance(block, EditorialBlocks):
                validate_editorial_state(block, interaction.values)
            elif isinstance(block, ExperienceBlocks):
                validate_experience_state(block, interaction.values)
            elif interaction.values:
                raise ValueError("Unexpected values for this block")
            if interaction.active_item is not None and (
                not isinstance(block, (Tabs, Timeline, Route, Diagram, Flashcards))
                or interaction.active_item not in {item.id for item in block.items}
            ):
                raise ValueError("Active item must belong to its block")
            if interaction.known_ids:
                known = set(interaction.known_ids)
                if (not isinstance(block, Flashcards) or len(known) != len(interaction.known_ids)
                        or not known.issubset({item.id for item in block.items})):
                    raise ValueError("Known cards must reference distinct cards of this deck")
            if interaction.hidden_series:
                if not isinstance(block, SeriesChart):
                    raise ValueError("Hidden series must belong to a chart")
                block.validate_hidden(interaction.hidden_series)
            if interaction.selected_ids:
                selected = set(interaction.selected_ids)
                if (not isinstance(block, Collection)
                        or len(selected) != len(interaction.selected_ids)
                        or not selected.issubset({item.id for item in block.items})):
                    raise ValueError("Selection must reference distinct items of the collection")
            if (isinstance(block, Table) and interaction.sort_column is not None
                    and interaction.sort_column >= len(block.columns)):
                interaction.sort_column = None
        return self
