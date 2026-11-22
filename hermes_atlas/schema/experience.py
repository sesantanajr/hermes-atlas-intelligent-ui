"""Media, geographic directories and bounded, stateful mini-applications."""
from typing import Annotated, Literal
from pydantic import AfterValidator, Field, HttpUrl, model_validator
from .base import Block, Strict, Identifier, Label, Text


def safe_url(url):
    if url.scheme != 'https' or url.username or url.password:
        raise ValueError('Use HTTPS without embedded credentials')
    return url


Link = Annotated[HttpUrl, AfterValidator(safe_url)]
Money = Annotated[int, Field(strict=True, ge=0, le=100_000_000)]
Quantity = Annotated[int, Field(strict=True, ge=0, le=999)]
Currency = Literal['BRL', 'EUR', 'USD', 'GBP']


def ids(items):
    result = {item.id for item in items}
    if len(result) != len(items):
        raise ValueError('Item IDs must be unique')
    return result


class Photo(Strict):
    alt: Label
    caption: Text = ''
    src: Link | Literal['atlas:camera', 'atlas:cinema']


class Image(Block):
    type: Literal['image']
    photo: Photo


class Gallery(Block):
    type: Literal['gallery']
    photos: Annotated[list[Photo], Field(min_length=2, max_length=24)]


class Recording(Block):
    transcript: Text


class Video(Recording):
    type: Literal['video']
    src: Link | Literal['atlas:focus']
    captions_url: Link | None = None


class Audio(Recording):
    type: Literal['audio']
    src: Link | Literal['atlas:tone']


class Place(Strict):
    id: Identifier
    label: Label
    detail: Text = ''
    lat: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    lon: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]


class Map(Block):
    type: Literal['map']
    pins: Annotated[list[Place], Field(min_length=1, max_length=40)]

    @model_validator(mode='after')
    def unique(self):
        ids(self.pins)
        return self


class Listing(Place):
    address: Label
    category: Label


class Places(Block):
    type: Literal['places']
    places: Annotated[list[Listing], Field(min_length=1, max_length=40)]

    @model_validator(mode='after')
    def unique(self):
        ids(self.places)
        return self


class Variant(Strict):
    id: Identifier
    label: Label
    price_cents: Money
    available: bool = True


class Product(Block):
    type: Literal['product']
    description: Text
    currency: Currency
    variants: Annotated[list[Variant], Field(min_length=1, max_length=24)]
    source_url: Link | None = None

    @model_validator(mode='after')
    def unique(self):
        ids(self.variants)
        return self


class Column(Strict):
    id: Identifier
    label: Label


class Task(Column):
    column: Identifier


class Kanban(Block):
    type: Literal['kanban']
    columns: Annotated[list[Column], Field(min_length=2, max_length=8)]
    tasks: Annotated[list[Task], Field(min_length=1, max_length=48)]

    @model_validator(mode='after')
    def references(self):
        allowed = ids(self.columns)
        ids(self.tasks)
        if any(task.column not in allowed for task in self.tasks):
            raise ValueError('Task must reference an existing column')
        return self


class Choice(Strict):
    label: Label
    target: Identifier


class Node(Column):
    choices: Annotated[list[Choice], Field(max_length=8)] = []


class DecisionTree(Block):
    type: Literal['decision_tree']
    start: Identifier
    nodes: Annotated[list[Node], Field(min_length=2, max_length=48)]

    @model_validator(mode='after')
    def graph(self):
        ids(self.nodes)
        nodes = {n.id: n for n in self.nodes}
        visited = set()

        def walk(key, path):
            if key not in nodes or key in path:
                raise ValueError('Invalid decision path')
            if key in visited:
                return
            for choice in nodes[key].choices:
                walk(choice.target, path | {key})
            visited.add(key)

        walk(self.start, set())
        if visited != nodes.keys():
            raise ValueError('Every decision must be reachable')
        return self


class Line(Column):
    price_cents: Money
    quantity: Quantity = 1


class BudgetPlanner(Block):
    type: Literal['budget_planner']
    currency: Currency
    limit_cents: Money
    items: Annotated[list[Line], Field(min_length=1, max_length=40)]

    @model_validator(mode='after')
    def unique(self):
        ids(self.items)
        return self


ExperienceBlocks = Image | Gallery | Video | Audio | Map | Places | Product | Kanban | DecisionTree | BudgetPlanner


def validate_experience_state(block, values):
    if not values:
        return
    if isinstance(block, Gallery):
        valid = set(values) == {'photo'} and values['photo'] in {str(i) for i in range(len(block.photos))}
    elif isinstance(block, Map):
        valid = (values.keys() <= {'pin', 'zoom'} and values.get('pin', block.pins[0].id) in ids(block.pins)
                 and values.get('zoom', '1') in {'1','2','4','8'})
    elif isinstance(block, Places):
        valid = values.keys() <= {'query'} and len(values.get('query', '')) <= 160
    elif isinstance(block, Product):
        valid = set(values) == {'variant'} and values['variant'] in ids(block.variants)
    elif isinstance(block, Kanban):
        valid = values.keys() <= ids(block.tasks) and set(values.values()) <= ids(block.columns)
    elif isinstance(block, BudgetPlanner):
        valid = values.keys() <= ids(block.items) and all(v.isascii() and v.isdigit() and len(v) <= 3 for v in values.values())
    elif isinstance(block, DecisionTree):
        path = values.get('path', '').split(',')
        edges = {n.id: {c.target for c in n.choices} for n in block.nodes}
        valid = set(values) == {'path'} and path[0] == block.start and all(b in edges.get(a, ()) for a,b in zip(path, path[1:]))
    else:
        valid = False
    if not valid:
        raise ValueError('Invalid saved interaction for ' + block.type)
