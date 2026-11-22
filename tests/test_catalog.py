import importlib.util
import json
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest
from pydantic import TypeAdapter, ValidationError

from hermes_atlas.catalog import detail, entries, search
from hermes_atlas.schema.canvas import Canvas, Component
from hermes_atlas.server.preview import decorate_live

BASE = "/api/plugins/hermes-atlas"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DATA_DIR", str(tmp_path))
    from hermes_atlas.server.app import app

    with TestClient(app, base_url="http://localhost") as instance:
        yield instance


def test_catalog_matches_every_validated_discriminator_and_example():
    items = entries()
    registry = TypeAdapter(Component).json_schema()["discriminator"]["mapping"]
    assert len(items) == 73
    assert {item["type"] for item in items} == set(registry)
    assert len(registry) == len(items)
    assert len({item["category"] for item in items}) == 8
    for item in items:
        details = detail(item["type"])
        example = details["example"]
        assert details["type"] == example["type"] == item["type"]
        assert example == item["example"]
        assert details["schema"]["properties"]["type"]["const"] == item["type"]
        document = {"id": "sample", "title": item["label"], "blocks": [example]}
        restored = Canvas.model_validate_json(Canvas.model_validate(document).model_dump_json())
        assert restored.blocks[0].id == example["id"]


def test_every_type_can_appear_before_the_next_block_finishes_streaming():
    for entry in entries():
        encoded = json.dumps(entry["example"], ensure_ascii=False)
        partial = 'Escolhi um bloco.\n```atlas\n{"title":"Prévia","blocks":[' + encoded + ',{"id":'
        snapshot = decorate_live({"text": partial})
        assert snapshot["text"] == "Escolhi um bloco."
        assert [block["type"] for block in snapshot["preview"]["blocks"]] == [entry["type"]]


def test_api_lists_filters_and_saves_a_quiz_revision_with_persisted_state(client):
    index = client.get(BASE + "/components")
    assert index.status_code == 200
    assert index.json() == search()
    assert all("example" not in item and "schema" not in item for item in index.json())
    query = {"q": "quiz", "category": "Controles interativos"}
    assert client.get(BASE + "/components", params=query).json() == search(**query)
    assert [entry["type"] for entry in search(**query)] == ["quiz"]
    assert client.get(BASE + "/components", params={**query, "category": "Formulários"}).json() == []
    assert client.get(BASE + "/components/unknown-kind").status_code == 404
    response = client.get(BASE + "/components/quiz")
    assert response.status_code == 200
    assert response.json() == detail("quiz")
    block = response.json()["example"]
    choice = block["options"][0]["id"]
    canvas = {"id": "response", "title": "Resposta salva", "blocks": [block],
              "state": {block["id"]: {"values": {"choice": choice, "answer": choice}}}}
    created = client.post(BASE + "/canvases", json=canvas)
    assert created.status_code == 200 and created.json()["revision"] == 1
    endpoint = BASE + "/canvases/response"
    assert client.get(endpoint).json()["canvas"]["state"][block["id"]]["values"] == canvas["state"][block["id"]]["values"]
    canvas["state"][block["id"]]["values"]["answer"] = "unknown-choice"
    invalid = client.post(BASE + "/canvases", json=canvas, params={"expected_revision": 1})
    assert invalid.status_code == 422
    assert client.get(endpoint).json()["revision"] == 1


def test_native_tool_discovers_a_type_then_renders_and_reads_it():
    from hermes_host import registered

    ctx, _ = registered()
    assert [m["type"] for m in ctx.call("atlas_components", {"q": "timer"})["matches"]] == [e["type"] for e in search(q="timer")]
    record = ctx.call("atlas_components", {"type": "timer"})["blocks"][0]
    assert record["schema"] == detail("timer")["schema"] and record["example"] == detail("timer")["example"]
    block = record["example"]
    canvas = {"id": "sample", "title": "Tempo", "blocks": [block],
              "state": {block["id"]: {"values": {"remaining_ms": "500"}}}}
    rendered = ctx.call("atlas_render", {"canvas": canvas})
    assert rendered["success"]
    fetched = ctx.call("atlas_get", {"id": rendered["id"]})["canvas"]
    assert fetched["state"][block["id"]]["values"] == {"remaining_ms": "500"}
    # Atlas 0.x replaced a canvas through atlas_render(expected_revision); that call still validates state.
    fetched["state"][block["id"]]["values"]["remaining_ms"] = "-5"
    assert ctx.call("atlas_render", {"canvas": fetched, "expected_revision": 1})["success"] is False
    fetched["state"][block["id"]]["values"]["remaining_ms"] = "250"
    replaced = ctx.call("atlas_render", {"canvas": fetched, "expected_revision": 1})
    assert replaced["success"] and replaced["revision"] == 2 and replaced["status"] == "updated"


def test_block_limit_and_legacy_canvas_are_preserved():
    block = {"id": "t", "type": "text", "title": "Texto", "text": "Legado"}
    old = Canvas.model_validate({"id": "v04", "title": "Existente", "blocks": [block]})
    assert old.schema_version == "1.0"
    mixed = old.model_dump()
    mixed["blocks"].extend({**detail("slider")["example"], "id": f"x{i}"} for i in range(31))
    assert len(Canvas.model_validate(mixed).blocks) == 32
    mixed["blocks"].append({**block, "id": "extra"})
    with pytest.raises(ValidationError):
        Canvas.model_validate(mixed)
