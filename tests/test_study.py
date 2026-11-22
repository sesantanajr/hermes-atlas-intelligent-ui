import pytest
from pydantic import ValidationError

from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.schema.study import Flashcards


def item(id):
    return {"id": id, "question": "Pergunta", "answer": "Resposta"}


def deck(items):
    return {"id": "revision", "type": "flashcards", "title": "Revisão", "items": items}


def test_flashcard_decks_enforce_identity_and_content_limits():
    assert Flashcards.model_validate(deck([item("a")])).items[0].id == "a"
    for invalid in (
        [], [item("a"), item("a")], [item(str(i)) for i in range(41)],
        [{**item("a"), "answer": ""}], [{**item("a"), "question": "a" * 521}],
        [{**item("a"), "answer": "a" * 3001}], [{**item("a"), "action": "unexpected"}],
    ):
        with pytest.raises(ValidationError):
            Flashcards.model_validate(deck(invalid))


def test_flashcard_review_state_is_bound_to_deck_and_survives_round_trip():
    payload = {"id": "unit", "title": "Unidade", "blocks": [deck([item("a"), item("b")])],
               "state": {"revision": {"active_item": "b", "known_ids": ["a"]}}}
    canvas = Canvas.model_validate(payload)
    assert Canvas.model_validate_json(canvas.model_dump_json()).state["revision"].known_ids == ["a"]
    for invalid in ({"active_item": "other"}, {"known_ids": ["unknown"]}, {"known_ids": ["a", "a"]}):
        with pytest.raises(ValidationError):
            Canvas.model_validate({**payload, "state": {"revision": invalid}})
    with pytest.raises(ValidationError):
        Canvas.model_validate({**payload, "blocks": [{"type": "text", "id": "revision", "title": "Texto", "text": "Exemplo"}]})
