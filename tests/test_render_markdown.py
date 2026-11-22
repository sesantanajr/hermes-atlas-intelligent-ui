"""The Markdown rendering is what CLI, TUI and messaging users see instead of the canvas."""
import pytest

from hermes_atlas import catalog
from hermes_atlas.render import outline, render_block, render_canvas

ENTRIES = catalog.entries()


@pytest.mark.parametrize("entry", ENTRIES, ids=[e["type"] for e in ENTRIES])
def test_every_catalogue_example_renders_its_title_and_some_content(entry):
    block = entry["example"]
    for locale in ("pt", "en"):
        for tables in (True, False):
            text = render_block(block, locale=locale, tables=tables)
            assert block["title"] in text
            # Every type except a bare heading or timer says something beyond its title.
            if entry["type"] not in {"heading"}:
                assert len(text) > len(block["title"]) + 4, text


def test_canvas_rendering_includes_description_state_and_sources():
    canvas = {
        "id": "trip", "title": "Viagem", "description": "Roteiro de três dias.",
        "blocks": [
            {"id": "bag", "type": "checklist", "title": "Bagagem", "items": ["Passaporte", "Carregador"]},
            {"id": "cost", "type": "calculator", "title": "Custo", "operation": "sum", "unit": "R$",
             "inputs": [{"label": "Hotel", "value": 300, "min": 0, "max": 900, "step": 10},
                        {"label": "Comida", "value": 120.5, "min": 0, "max": 900, "step": 0.5}]},
        ],
        "state": {"bag": {"checked": [1]}},
        "sources": [{"title": "Guia", "url": "https://example.org/guia"}],
    }
    text = render_canvas(canvas, revision=3)
    assert text.startswith("# Viagem (v3)")
    assert "Roteiro de três dias." in text
    assert "- [ ] Passaporte" in text and "- [x] Carregador" in text
    assert "Resultado: R$ 420,5" in text
    assert "## Fontes" in text and "[Guia](https://example.org/guia)" in text
    english = render_canvas(canvas, locale="en")
    assert "Result: R$ 420.5" in english and "## Sources" in english
    assert outline(canvas) == ["checklist: Bagagem", "calculator: Custo"]


def test_tables_become_lists_for_chat_platforms():
    block = {"id": "t", "type": "table", "title": "Preços", "columns": ["Item", "Preço"], "rows": [["Café", "R$ 8"]]}
    assert "| Item | Preço |" in render_block(block)
    plain = render_block(block, tables=False)
    assert "|" not in plain and "- Café · Preço: R$ 8" in plain


def test_long_canvases_are_shortened_at_a_block_boundary():
    blocks = [{"id": f"b{i}", "type": "text", "title": f"Seção {i}", "text": "x" * 400} for i in range(12)]
    text = render_canvas({"id": "long", "title": "Longo", "blocks": blocks}, max_chars=1500)
    assert len(text) < 2200
    assert "Seção 0" in text and "Seção 11" not in text
    assert "blocos" in text


def test_user_interaction_state_is_visible():
    quiz = {"id": "q", "type": "quiz", "title": "Capital", "question": "Capital do Brasil?",
            "options": [{"id": "a", "label": "Rio"}, {"id": "b", "label": "Brasília"}],
            "answer_id": "b", "explanation": "Desde 1960."}
    text = render_block(quiz, {"values": {"choice": "b", "answer": "b"}})
    assert "(x) Brasília" in text and "correta" in text and "Desde 1960." in text
    budget = {"id": "b", "type": "budget_planner", "title": "Orçamento", "currency": "BRL", "limit_cents": 10000,
              "items": [{"id": "x", "label": "Ingresso", "price_cents": 2500, "quantity": 1}]}
    text = render_block(budget, {"values": {"x": "3"}})
    assert "3 × Ingresso: R$ 75,00" in text and "Saldo: R$ 25,00" in text


def test_malformed_stored_blocks_never_raise():
    assert render_block({"type": "table", "title": "Quebrada", "columns": None, "rows": "nope"}) == "## Quebrada"
    assert render_block({"type": "series", "title": "S", "labels": ["a"], "datasets": [{"values": None}]})
    assert render_canvas({"blocks": [None, 7, {"type": "unknown", "title": "?"}]}).startswith("# Canvas")
