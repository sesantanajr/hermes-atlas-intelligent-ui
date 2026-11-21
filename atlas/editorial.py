"""Typed text, reference, document and layout blocks."""
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, HttpUrl

from .block_base import Block, Identifier, Label, Strict

Body = Annotated[str, Field(min_length=1, max_length=4000)]
Short = Annotated[str, Field(max_length=600)]
Tone = Literal["neutral", "info", "success", "warning"]


def _distinct(items):
    if len({item.id for item in items}) != len(items):
        raise ValueError("Item IDs must be unique within the block")
    return items


def _public_link(url):
    if url.username or url.password:
        raise ValueError("Reference URL must not contain credentials")
    return url


Link = Annotated[HttpUrl, AfterValidator(_public_link)]


class Heading(Block):
    type: Literal["heading"]
    level: Literal[2, 3, 4, 5] = 3
    subtitle: Short = ""


class Callout(Block):
    type: Literal["callout"]
    tone: Tone = "info"
    body: Body


class Quote(Block):
    type: Literal["quote"]
    quote: Body
    attribution: Label
    url: Link | None = None


class Definition(Strict):
    term: Label
    definition: Body


class Glossary(Block):
    type: Literal["glossary"]
    entries: Annotated[list[Definition], Field(min_length=1, max_length=40)]


class CodeBlock(Block):
    type: Literal["code"]
    language: Annotated[str, Field(min_length=1, max_length=50)] = "text"
    code: Annotated[str, Field(min_length=1, max_length=12000)]


class MarkdownBlock(Block):
    type: Literal["markdown"]
    body: Annotated[str, Field(min_length=1, max_length=12000)]


class MathText(Strict):
    kind: Literal["text"]
    text: Label


class Fraction(Strict):
    kind: Literal["fraction"]
    numerator: Label
    denominator: Label


class Power(Strict):
    kind: Literal["power"]
    base: Label
    exponent: Label


class Radical(Strict):
    kind: Literal["root"]
    radicand: Label


Atom = Annotated[MathText | Fraction | Power | Radical, Field(discriminator="kind")]


class Equation(Block):
    type: Literal["equation"]
    expression: Annotated[list[Atom], Field(min_length=1, max_length=48)]
    description: Body


class Badge(Strict):
    label: Label
    tone: Tone = "neutral"


class Badges(Block):
    type: Literal["badges"]
    items: Annotated[list[Badge], Field(min_length=1, max_length=24)]


class Fact(Strict):
    label: Label
    value: Annotated[str, Field(min_length=1, max_length=600)]


class Facts(Block):
    type: Literal["facts"]
    entries: Annotated[list[Fact], Field(min_length=1, max_length=32)]


class Section(Strict):
    id: Identifier
    title: Label
    body: Body


Sections = Annotated[list[Section], Field(min_length=1, max_length=20), AfterValidator(_distinct)]


class Article(Block):
    type: Literal["article"]
    byline: Short = ""
    lead: Short = ""
    sections: Sections


class Accordion(Block):
    type: Literal["accordion"]
    items: Sections


class ActionCard(Section):
    prompt: Short = ""


class Cards(Block):
    type: Literal["cards"]
    items: Annotated[list[ActionCard], Field(min_length=1, max_length=12), AfterValidator(_distinct)]


class Columns(Block):
    type: Literal["columns"]
    columns: Annotated[list[Section], Field(min_length=2, max_length=3), AfterValidator(_distinct)]


class Carousel(Block):
    type: Literal["carousel"]
    slides: Annotated[list[Section], Field(min_length=2, max_length=20), AfterValidator(_distinct)]


class StepsList(Block):
    type: Literal["steps_list"]
    steps: Sections


class Reference(Strict):
    title: Label
    author: Short = ""
    locator: Short = ""
    url: Link


class Bibliography(Block):
    type: Literal["bibliography"]
    entries: Annotated[list[Reference], Field(min_length=1, max_length=30)]


class Entity(Block):
    type: Literal["entity"]
    name: Label
    category: Label
    summary: Body
    attributes: Annotated[list[Fact], Field(max_length=16)] = []
    url: Link | None = None


class Document(Block):
    type: Literal["document"]
    body: Body


EditorialBlocks = (Heading | Callout | Quote | Glossary | CodeBlock | MarkdownBlock | Equation |
                   Badges | Facts | Article | Accordion | Cards | Columns | Carousel | StepsList |
                   Bibliography | Entity | Document)
EDITORIAL_TYPES = frozenset(model.model_fields["type"].annotation.__args__[0]
                            for model in EditorialBlocks.__args__)


def validate_editorial_state(block: EditorialBlocks, values: dict[str, str]):
    """Validate references to the current revision and constrain editable text."""
    if not values:
        return
    if isinstance(block, Glossary) and values.keys() <= {"query"} and len(values["query"]) <= 160:
        return
    if isinstance(block, CodeBlock) and values == {"numbers": "1"}:
        return
    if isinstance(block, Document) and values.keys() <= {"draft"} and len(values["draft"]) <= 4000:
        return
    if isinstance(block, Carousel) and set(values) == {"slide"} and values["slide"] in {s.id for s in block.slides}:
        return
    if isinstance(block, (Accordion, StepsList)):
        items = block.items if isinstance(block, Accordion) else block.steps
        if values.keys() <= {s.id for s in items} and all(v == "1" for v in values.values()):
            return
    raise ValueError("Invalid interaction state for editorial block")
