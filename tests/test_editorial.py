import pytest
from pydantic import TypeAdapter, ValidationError

from hermes_atlas.schema.editorial import EDITORIAL_TYPES, EditorialBlocks, validate_editorial_state


def build(kind, **data):
    return TypeAdapter(EditorialBlocks).validate_python(
        {"id": "example", "title": "Exemplo", "type": kind, **data}
    )


def section(identifier):
    return {"id": identifier, "title": identifier, "body": "Detalhes"}


def test_editorial_catalog_has_eighteen_discriminants():
    assert len(EDITORIAL_TYPES) == 18


@pytest.mark.parametrize(("kind", "data"), [
    ("heading", {"level": 7}),
    ("callout", {"body": "Nota", "tone": "external"}),
    ("quote", {"quote": "Trecho", "attribution": "Fonte", "url": "https://user:password@example.com/"}),
    ("glossary", {"entries": []}),
    ("code", {"code": "x" * 12001}),
    ("markdown", {"body": ""}),
    ("equation", {"expression": [{"kind": "fraction", "numerator": "n"}], "description": "Exemplo"}),
    ("badges", {"items": [{"label": "x"}] * 25}),
    ("facts", {"entries": [{"label": "x", "value": ""}]}),
    ("article", {"sections": [section("a")] * 2}),
    ("accordion", {"items": [section("a")] * 2}),
    ("cards", {"items": [{**section("a"), "prompt": "x"*601}]}),
    ("columns", {"columns": [section("a")]}),
    ("carousel", {"slides": [section("a")] * 2}),
    ("steps_list", {"steps": [section(str(i)) for i in range(21)]}),
    ("bibliography", {"entries": [{"title": "Fonte", "url": "file:///test.html"}]}),
    ("entity", {"name": "N", "category": "C", "summary": "S", "attributes": [{"label":"L", "value":"V"}]*17}),
    ("document", {"body": "x"*4001}),
])
def test_invalid_editorial_content_is_rejected(kind, data):
    with pytest.raises(ValidationError):
        build(kind, **data)


@pytest.mark.parametrize(("kind", "data", "valid", "invalid"), [
    ("glossary", {"entries":[{"term":"T","definition":"D"}]}, {"query":"x"*160}, {"query":"x"*161}),
    ("code", {"code":"print(1)"}, {"numbers":"1"}, {"numbers":"true"}),
    ("document", {"body":"rascunho"}, {"draft":""}, {"draft":"x"*4001}),
    ("carousel", {"slides":[section("a"),section("b")]}, {"slide":"b"}, {"slide":"desconhecido"}),
    ("steps_list", {"steps":[section("a")]}, {"a":"1"}, {"b":"1"}),
    ("accordion", {"items":[section("a")]}, {"a":"1"}, {"a":"false"}),
    ("heading", {}, {}, {"query":"titulo"}),
])
def test_editorial_interaction_matches_kind_keys_and_limits(kind,data,valid,invalid):
    block=build(kind, **data)
    validate_editorial_state(block,{})
    validate_editorial_state(block,valid)
    with pytest.raises(ValueError):
        validate_editorial_state(block,invalid)
    with pytest.raises(ValueError):
        validate_editorial_state(block,{"unrelated":"1"})
