"""Closed, text-only layouts for exploring sections and ordered milestones."""
from typing import Annotated, Literal

from pydantic import Field, field_validator

from .base import Block, Identifier, Label, Strict


class ExploreItem(Strict):
    id: Identifier
    title: Label
    body: Annotated[str, Field(min_length=1, max_length=3000)]
    points: Annotated[list[Label], Field(max_length=8)] = []


class TimelineItem(ExploreItem):
    when: Annotated[str, Field(max_length=80)] = ""
    status: Literal["done", "current", "upcoming"] | None = None


def _distinct_items(items):
    if len({item.id for item in items}) != len(items):
        raise ValueError("Each item in the block must have a unique id")
    return items


class Tabs(Block):
    type: Literal["tabs"]
    items: Annotated[list[ExploreItem], Field(min_length=2, max_length=10)]

    _ids = field_validator("items")(_distinct_items)


class Timeline(Block):
    type: Literal["timeline"]
    items: Annotated[list[TimelineItem], Field(min_length=1, max_length=24)]

    _ids = field_validator("items")(_distinct_items)
