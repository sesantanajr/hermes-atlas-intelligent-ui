"""Shared primitives for the declarative canvas schema."""
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field

Text = Annotated[str, Field(max_length=12000)]
Label = Annotated[str, Field(min_length=1, max_length=160)]
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Number = Annotated[float, Field(allow_inf_nan=False, ge=-1e12, le=1e12)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Block(Strict):
    id: Identifier
    title: Label
