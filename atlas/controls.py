"""Declarative, locally interactive controls and their persisted answers."""
import json
import re
from datetime import date
from decimal import Decimal
from fractions import Fraction
from typing import Annotated, ClassVar, Literal

from pydantic import Field, model_validator

from .block_base import Block, Identifier, Label, Number, Strict


class Control(Block):
    state_keys: ClassVar[set[str]] = {"value"}

    def validate_values(self, values: dict[str, str] | None) -> None:
        values = values or {}
        if values.keys() - self.state_keys:
            raise ValueError("Unknown control state field")
        if any(not isinstance(value, str) for value in values.values()):
            raise ValueError("Control state must contain strings")
        self.check_answer(values)

    def check_answer(self, values: dict[str, str]) -> None:
        pass


class ShortAnswer(Control):
    type: Literal["short_answer"]
    placeholder: Annotated[str, Field(max_length=240)] = ""

    def check_answer(self, values):
        if len(values.get("value", "")) > 240:
            raise ValueError("Short answer exceeds 240 characters")


class LongAnswer(Control):
    type: Literal["long_answer"]
    placeholder: Annotated[str, Field(max_length=240)] = ""

    def check_answer(self, values):
        if len(values.get("value", "")) > 4000:
            raise ValueError("Long answer exceeds 4000 characters")


def read_number(raw: str) -> Decimal:
    if len(raw) > 64 or not re.fullmatch(r"-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]{1,3})?", raw):
        raise ValueError("Invalid number")
    value = Decimal(raw)
    if abs(value) > Decimal("1e12"):
        raise ValueError("Number exceeds the supported range")
    return value


class NumberInput(Control):
    type: Literal["number_input"]
    min: Number | None = None
    max: Number | None = None
    unit: Annotated[str, Field(max_length=24)] = ""

    @model_validator(mode="after")
    def bounds(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Minimum must not exceed maximum")
        return self

    def check_answer(self, values):
        if values.get("value"):
            # Drafts may be temporarily outside the configured input bounds.
            read_number(values["value"])


def iso_date(value: str) -> str:
    if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
        raise ValueError("Expected an ISO calendar date (YYYY-MM-DD)")
    return value


class DateControl(Control):
    earliest: str | None = None
    latest: str | None = None

    @model_validator(mode="after")
    def bounds(self):
        for bound in (self.earliest, self.latest):
            if bound is not None:
                iso_date(bound)
        if self.earliest and self.latest and self.earliest > self.latest:
            raise ValueError("Earliest date must precede latest date")
        return self

    def check_answer(self, values):
        for value in values.values():
            if value:
                iso_date(value)


class DatePicker(DateControl):
    type: Literal["date_picker"]


class DateRange(DateControl):
    type: Literal["date_range"]
    state_keys = {"start", "end"}


class ControlOption(Strict):
    id: Identifier
    label: Label
    detail: Annotated[str, Field(max_length=400)] = ""


def unique(ids: list[str]) -> set[str]:
    result = set(ids)
    if len(result) != len(ids):
        raise ValueError("Identifiers must be unique")
    return result


def validate_selection(raw: str, allowed: set[str]) -> None:
    if len(raw) > 4000:
        raise ValueError("Selection exceeds supported size")
    selected = json.loads(raw)
    if not isinstance(selected, list) or not all(isinstance(item, str) for item in selected):
        raise ValueError("Expected a list of selected identifiers")
    if unique(selected) - allowed:
        raise ValueError("Unknown selection")


class ChoiceControl(Control):
    options: Annotated[list[ControlOption], Field(min_length=2, max_length=32)]

    @model_validator(mode="after")
    def distinct_options(self):
        unique([option.id for option in self.options])
        return self

    def check_answer(self, values):
        allowed = {option.id for option in self.options}
        if any(value and value not in allowed for value in values.values()):
            raise ValueError("Unknown option")


class SingleChoice(ChoiceControl):
    type: Literal["single_choice"]


class MultiChoice(ChoiceControl):
    type: Literal["multi_choice"]
    state_keys = {"selected"}

    def check_answer(self, values):
        validate_selection(values.get("selected", "[]"), {option.id for option in self.options})


class Segmented(ChoiceControl):
    type: Literal["segmented"]


class Toggle(Control):
    type: Literal["toggle"]
    initial: bool = False

    def check_answer(self, values):
        if "value" in values and values["value"] not in {"true", "false"}:
            raise ValueError("Expected a boolean switch value")


class Slider(Control):
    type: Literal["slider"]
    min: Number = 0
    max: Number = 100
    step: Annotated[Number, Field(gt=0)] = 1
    initial: Number | None = None
    unit: Annotated[str, Field(max_length=24)] = ""

    @model_validator(mode="after")
    def bounds(self):
        if self.max <= self.min or self.step > self.max - self.min:
            raise ValueError("Invalid slider bounds or step")
        if self.initial is not None:
            self.check_answer({"value": str(self.initial)})
        return self

    def check_answer(self, values):
        if "value" in values:
            value = read_number(values["value"])
            low, high, step = (Fraction(str(n)) for n in (self.min, self.max, self.step))
            if not low <= value <= high or (Fraction(value) - low) % step:
                raise ValueError("Value falls outside slider steps")


class Rating(Control):
    type: Literal["rating"]
    stars: Annotated[int, Field(ge=2, le=10)] = 5

    def check_answer(self, values):
        if values.get("value", "") not in {"", *(str(i) for i in range(1, self.stars + 1))}:
            raise ValueError("Invalid star rating")


class TaskGroup(Strict):
    id: Identifier
    label: Label
    tasks: Annotated[list[ControlOption], Field(min_length=1, max_length=24)]


class ChecklistGroup(Control):
    type: Literal["checklist_group"]
    groups: Annotated[list[TaskGroup], Field(min_length=1, max_length=8)]
    state_keys = {"selected"}

    @model_validator(mode="after")
    def distinct_tasks(self):
        unique([group.id for group in self.groups])
        ids = [task.id for group in self.groups for task in group.tasks]
        unique(ids)
        if len(ids) > 96:
            raise ValueError("At most 96 tasks supported")
        if len(json.dumps(ids, separators=(",", ":"))) > 4000:
            raise ValueError("Task identifiers exceed the combined selection size")
        return self

    def check_answer(self, values):
        validate_selection(values.get("selected", "[]"), {task.id for group in self.groups for task in group.tasks})


class Poll(ChoiceControl):
    type: Literal["poll"]
    state_keys = {"choice", "vote"}

    def check_answer(self, values):
        super().check_answer(values)
        if values.get("vote") and values.get("choice") != values["vote"]:
            raise ValueError("Vote and selected option must match")


class Quiz(ChoiceControl):
    type: Literal["quiz"]
    question: Annotated[str, Field(min_length=1, max_length=1000)]
    answer_id: Identifier
    explanation: Annotated[str, Field(min_length=1, max_length=1600)]
    state_keys = {"choice", "answer"}

    @model_validator(mode="after")
    def known_answer(self):
        if self.answer_id not in {option.id for option in self.options}:
            raise ValueError("Quiz answer must refer to an option")
        return self

    def check_answer(self, values):
        super().check_answer(values)
        if values.get("answer") and values.get("choice") != values["answer"]:
            raise ValueError("Graded and selected answers must match")


class Timer(Control):
    type: Literal["timer"]
    seconds: Annotated[int, Field(ge=1, le=86400)]
    state_keys = {"deadline_ms", "remaining_ms"}

    def check_answer(self, values):
        if len(values) > 1:
            raise ValueError("Timer cannot be both paused and running")
        for key, raw in values.items():
            limit = self.seconds * 1000 if key == "remaining_ms" else 8640000000000000
            if not re.fullmatch(r"[0-9]{1,16}", raw) or int(raw) > limit:
                raise ValueError("Invalid timer value")


ControlBlocks = ShortAnswer | LongAnswer | NumberInput | DatePicker | DateRange | SingleChoice | MultiChoice | Toggle | Slider | Rating | Segmented | ChecklistGroup | Poll | Quiz | Timer
