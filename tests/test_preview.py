import json

from atlas.preview import decorate_live


def test_complete_blocks_appear_before_the_next_one_finishes():
    block = {"type": "metric", "id": "one", "title": "Valor", "value": "15"}
    prefix = 'Resumo\n```atlas\n{"title":"Comparativo","blocks":[' + json.dumps(block)
    snapshot = {"status": "running", "text": prefix + ',{"type":"chart","points":['}
    result = decorate_live(snapshot)
    assert result["text"] == "Resumo"
    assert result["preview"]["title"] == "Comparativo"
    assert result["preview"]["blocks"] == [{**block, "detail": ""}]
    assert snapshot["text"].endswith('"points":[')


def test_preview_handles_nested_keys_and_rejects_invalid_blocks():
    for text in ['{"metadata":{"blocks":[{"type":"fake"}]},"blocks":[',
                 '{"blocks":[{"id":"bad","type":"unsupported","title":"bad"}]']:
        assert decorate_live({"text": "Resposta\n```atlas\n" + text}) == {"text": "Resposta"}
    plain = {"text": "Exemplo de texto com blocks: []"}
    assert decorate_live(plain) == plain


def test_preview_does_not_retain_another_runs_metadata():
    payload = '{"blocks":[{"type":"text","id":"t","title":"Um","text":"texto com } e ```"}'
    result = decorate_live({"text": "```atlas\n" + payload})
    assert result["preview"]["blocks"][0]["text"] == "texto com } e ```"


def test_preview_keeps_completed_blocks_and_supplies_renderer_defaults():
    block = {"type": "calculator", "id": "add", "title": "Soma", "operation": "sum",
             "inputs": [{"label": "A", "value": 1}, {"label": "B", "value": 2}]}
    partial = '{"blocks":[' + json.dumps(block) + ',{"type":"text","text":"' + 'a' * 260_000
    canvas = decorate_live({"text": "```atlas\n" + partial})["preview"]
    assert canvas["blocks"][0]["inputs"][0] == {"label": "A", "value": 1, "min": 0, "max": 100, "step": 1}
