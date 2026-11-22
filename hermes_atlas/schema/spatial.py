"""Figures with normalized coordinates and itineraries with geographic coordinates."""
from typing import Annotated, Literal
from pydantic import Field, HttpUrl, field_validator, model_validator
from .base import Block, Strict, Identifier, Label


class Detail(Strict):
    id: Identifier
    title: Label
    body: Annotated[str, Field(min_length=1, max_length=2000)]


class Hotspot(Detail):
    x: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False, strict=True)]
    y: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False, strict=True)]


class Stop(Detail):
    lat: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False, strict=True)]
    lon: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False, strict=True)]


class Diagram(Block):
    type: Literal["diagram"]
    alt: Annotated[str, Field(min_length=1, max_length=600)]
    illustration: Literal["camera"] | None = None
    image_url: HttpUrl | None = None
    items: Annotated[list[Hotspot], Field(min_length=1, max_length=16)]

    @field_validator("image_url")
    @classmethod
    def image_origin(cls, url):
        if url and (url.scheme != "https" or url.username or url.password):
            raise ValueError("Diagram image must use HTTPS without credentials")
        return url

    @model_validator(mode="after")
    def figure(self):
        if self.illustration and self.image_url:
            raise ValueError("Choose one diagram image")
        if len({p.id for p in self.items}) != len(self.items):
            raise ValueError("Diagram part IDs must be unique")
        return self


class Route(Block):
    type: Literal["route"]
    items: Annotated[list[Stop], Field(min_length=2, max_length=24)]

    @model_validator(mode="after")
    def unique_stops(self):
        if len({p.id for p in self.items}) != len(self.items):
            raise ValueError("Route stop IDs must be unique")
        return self
