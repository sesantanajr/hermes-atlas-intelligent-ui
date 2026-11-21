import pytest
from pydantic import ValidationError
from atlas.models import Canvas


def collection(items, selected=None):
    return Canvas.model_validate({
        "id": "movies", "title": "Filmes",
        "blocks": [{"id": "premieres", "type": "collection", "title": "Estreias", "items": items}],
        "state": {"premieres": {"selected_ids": selected or [], "collection_sort": "score"}},
    })


def test_collection_round_trip_preserves_selection_metadata_and_source():
    canvas = collection([{
        "id": "one", "title": "Primeiro", "metadata": {"Duração": "91 min"},
        "source": {"title": "Produtora", "url": "https://example.org/film"},
        "image_url": "https://example.org/poster.jpg", "score": 0,
    }], ["one"])
    reopened = Canvas.model_validate_json(canvas.model_dump_json())
    assert reopened.state["premieres"].selected_ids == ["one"]
    assert reopened.blocks[0].items[0].metadata["Duração"] == "91 min"
    assert reopened.blocks[0].items[0].score == 0


@pytest.mark.parametrize("items,selected", [
    ([{"id": "a", "title": "A"}] * 2, []),
    ([{"id": "a", "title": "A"}], ["missing"]),
    ([{"id": "a", "title": "A"}], ["a", "a"]),
    ([{"id": "a", "title": "A", "image_url": "http://example.org/poster.jpg"}], []),
    ([{"id": "a", "title": "A", "image_url": "https://user:pass@example.org/poster.jpg"}], []),
    ([{"id": "a", "title": "A", "score": 103}], []),
])
def test_invalid_collection(items, selected):
    with pytest.raises(ValidationError):
        collection(items, selected)


def test_outdated_sort_column_is_discarded_on_import():
    canvas = Canvas.model_validate({
        "id": "report", "title": "Relatório",
        "blocks": [{"id": "table", "type": "table", "title": "Linhas", "columns": ["Nome"], "rows": [["A"], ["B"]]}],
        "state": {"table": {"sort_column": 3}},
    })
    assert canvas.state["table"].sort_column is None
