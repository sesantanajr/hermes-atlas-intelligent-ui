"""Planning blocks (1.1.2): a Gantt chart, a month calendar, a 2x2 priority matrix and a tree.

Like every block, they are declarative and validated: dates are ISO strings, references must name
existing ids, and what the person does on them (the item they opened, the quadrant they dragged a
card to, the branches they folded) is kept as plain ``values`` in the canvas state.
"""
from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from .base import Block, Identifier, Label, Strict, Text

Tone = Literal["neutral", "info", "success", "warning", "danger"]
_SCALES = {"day", "week", "month"}


def _iso_date(value):
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Use an ISO date (YYYY-MM-DD)") from exc
    if len(value) != 10:
        raise ValueError("Use an ISO date (YYYY-MM-DD)")
    return value


def _iso_month(value):
    _iso_date(value + "-01")
    return value


IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$"), AfterValidator(_iso_date)]
IsoMonth = Annotated[str, Field(min_length=7, max_length=7, pattern=r"^\d{4}-\d{2}$"), AfterValidator(_iso_month)]
Clock = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


def _unique(items, what):
    found = {item.id for item in items}
    if len(found) != len(items):
        raise ValueError(f"{what} ids must be unique")
    return found


class GanttTask(Strict):
    id: Identifier
    label: Label
    start: IsoDate
    end: IsoDate
    progress: Annotated[int, Field(strict=True, ge=0, le=100)] = 0
    group: Annotated[str, Field(max_length=80)] = ""
    owner: Annotated[str, Field(max_length=80)] = ""
    milestone: bool = False
    depends_on: Annotated[list[Identifier], Field(max_length=6)] = []


class Gantt(Block):
    type: Literal["gantt"]
    tasks: Annotated[list[GanttTask], Field(min_length=1, max_length=60)]
    today: IsoDate | None = None

    @model_validator(mode="after")
    def coherent(self):
        known = _unique(self.tasks, "Task")
        for task in self.tasks:
            if task.end < task.start:
                raise ValueError(f"Task {task.id} ends before it starts")
            if task.milestone and task.end != task.start:
                raise ValueError(f"Milestone {task.id} must start and end on the same day")
            if task.id in task.depends_on or not set(task.depends_on) <= known:
                raise ValueError(f"Task {task.id} depends on an unknown task")
        return self


class CalendarEvent(Strict):
    id: Identifier
    label: Label
    date: IsoDate
    end: IsoDate | None = None
    time: Clock | None = None
    tone: Tone = "neutral"
    detail: Text = ""

    @model_validator(mode="after")
    def ordered(self):
        if self.end is not None and self.end < self.date:
            raise ValueError(f"Event {self.id} ends before it starts")
        return self


class Calendar(Block):
    type: Literal["calendar"]
    month: IsoMonth | None = None
    events: Annotated[list[CalendarEvent], Field(min_length=1, max_length=80)]

    @model_validator(mode="after")
    def unique(self):
        _unique(self.events, "Event")
        return self


class Quadrant(Strict):
    id: Identifier
    label: Label
    hint: Annotated[str, Field(max_length=200)] = ""


class MatrixItem(Strict):
    id: Identifier
    label: Label
    quadrant: Identifier
    detail: Annotated[str, Field(max_length=600)] = ""


class Matrix(Block):
    """Four quadrants in reading order: top-left, top-right, bottom-left, bottom-right."""
    type: Literal["matrix"]
    x_axis: Label
    y_axis: Label
    quadrants: Annotated[list[Quadrant], Field(min_length=4, max_length=4)]
    items: Annotated[list[MatrixItem], Field(max_length=48)] = []

    @model_validator(mode="after")
    def references(self):
        allowed = _unique(self.quadrants, "Quadrant")
        _unique(self.items, "Item")
        if any(item.quadrant not in allowed for item in self.items):
            raise ValueError("Item must reference an existing quadrant")
        return self


class TreeNode(Strict):
    id: Identifier
    label: Label
    parent: Identifier | None = None
    detail: Annotated[str, Field(max_length=600)] = ""
    tone: Tone = "neutral"


class Tree(Block):
    """A hierarchy with one root: an org chart, a mind map, a breakdown of work."""
    type: Literal["tree"]
    nodes: Annotated[list[TreeNode], Field(min_length=1, max_length=120)]

    @model_validator(mode="after")
    def hierarchy(self):
        known = _unique(self.nodes, "Node")
        roots = [node for node in self.nodes if node.parent is None]
        if len(roots) != 1:
            raise ValueError("A tree needs exactly one root (a node without parent)")
        parent = {node.id: node.parent for node in self.nodes}
        for node in self.nodes:
            if node.parent is not None and node.parent not in known:
                raise ValueError(f"Node {node.id} names an unknown parent")
            seen, cursor = set(), node.id
            while cursor is not None:
                if cursor in seen:
                    raise ValueError("The tree has a cycle")
                seen.add(cursor)
                cursor = parent[cursor]
        return self


PlanningBlocks = Gantt | Calendar | Matrix | Tree


def validate_planning_state(block, values):
    if not values:
        return
    if isinstance(block, Gantt):
        tasks = {task.id for task in block.tasks}
        valid = values.keys() <= {"task", "scale"} and values.get("task", block.tasks[0].id) in tasks \
            and values.get("scale", "week") in _SCALES
    elif isinstance(block, Calendar):
        valid = values.keys() <= {"month", "event"} and values.get("event", block.events[0].id) in {
            event.id for event in block.events}
        if valid and "month" in values:
            try:
                _iso_month(values["month"])
            except ValueError:
                valid = False
    elif isinstance(block, Matrix):
        quadrants = {quadrant.id for quadrant in block.quadrants}
        items = {item.id for item in block.items}
        valid = values.keys() <= items and set(values.values()) <= quadrants
    elif isinstance(block, Tree):
        valid = values.keys() <= {node.id for node in block.nodes} and set(values.values()) <= {"closed"}
    else:
        valid = False
    if not valid:
        raise ValueError("Invalid saved interaction for " + block.type)
