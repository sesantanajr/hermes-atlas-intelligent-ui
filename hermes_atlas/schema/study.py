"""A reviewable deck of question and answer pairs."""
from typing import Annotated, Literal

from pydantic import Field, field_validator

from .base import Block, Identifier, Strict


class StudyItem(Strict):
    id: Identifier
    question: Annotated[str, Field(min_length=1, max_length=520)]
    answer: Annotated[str, Field(min_length=1, max_length=3000)]


class Flashcards(Block):
    type: Literal["flashcards"]
    items: Annotated[list[StudyItem], Field(min_length=1, max_length=40)]

    @field_validator("items")
    @classmethod
    def distinct_cards(cls, cards):
        if len({card.id for card in cards}) != len(cards):
            raise ValueError("Each flashcard must have a unique id")
        return cards
