"""The Atlas canvas protocol: a closed, validated set of declarative UI blocks.

A canvas is plain JSON. Nothing in it is executable: no HTML, no scripts, no expressions.
Every block type is a pydantic model with ``extra="forbid"`` and bounded sizes, so a document
that validates here is safe to store, to hand to the renderer and to send back to the model.
"""
from .base import Block, Identifier, Label, Number, Strict, Text
from .canvas import Canvas, Component, Interaction, Source

__all__ = ["Block", "Canvas", "Component", "Identifier", "Interaction", "Label", "Number", "Source",
           "Strict", "Text"]
