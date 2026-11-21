import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from atlas import gateway, runs
from atlas.protocol import extract
from atlas.store import Store


MARKERS = ('[SILENT]', 'silent', 'no_reply', 'NO REPLY', '[静默]', '静默', '[沉默]', '沉默')


@pytest.mark.parametrize('marker', MARKERS)
def test_live_holds_marker_until_it_becomes_meaningful_text(marker):
    for i in range(1, len(marker) + 1):
        prefix = marker[:i]
        raw = {'status': 'running', 'text': prefix}
        assert runs.public(raw)['text'] == ''
        assert raw['text'] == prefix
        assert runs.public({'status': 'running', 'text': 'Resposta.\r\n' + prefix})['text'] == 'Resposta.'
    named = f'{marker} é o nome do marcador.'
    assert runs.public({'status': 'running', 'text': named})['text'] == named
    assert extract(' Resposta.\n\n' + marker)[0].strip() == 'Resposta.'


@pytest.mark.parametrize('literal', [
    'O Hermes escreveu [SILENT].', '"[SILENT]"', '[SILENT] em uma frase',
    '`[SILENT]`', '> [SILENT]', '~~~text\n[SILENT]', '````\n```\n[SILENT]',
    '    [SILENT]', '\t[SILENT]', '~~~\n[SILENT]\n~~~', '[SILENCIO]',
])
def test_prose_and_literal_markdown_preserved(literal):
    assert extract(literal)[0] == literal
    assert runs.public({'status': 'running', 'text': literal})['text'] == literal
    assert runs.public({'status': 'completed', 'text': literal})['text'] == literal


def test_interim_history_and_artifacts_use_their_own_presentation():
    events = [
        {'event': 'message.interim', 'seq': 0, 'text': '[SILENT]'},
        {'type': 'message.interim', 'seq': 1, 'text': 'Etapa pronta.\n[SILENT]'},
        {'type': 'tool.completed', 'seq': 2, 'preview': '[SILENT]'},
    ]
    projected = runs.public({'status': 'running', 'text': '', 'events': events})['events']
    assert [item['seq'] for item in projected] == [1, 2]
    assert projected[0]['text'] == 'Etapa pronta.'
    assert events[1]['text'].endswith('[SILENT]')
    assert projected[1]['preview'] == '[SILENT]'
    block = {'type': 'text', 'id': 'one', 'title': 'Exemplo', 'text': '[SILENT]'}
    canvas = json.dumps({'id': 'x', 'title': 'Sinal', 'blocks': [block]})
    text, artifact, warning = extract('```atlas\n' + canvas + '\n```\n[SILENT]')
    assert text == '' and warning is None and artifact.blocks[0].text == '[SILENT]'


def test_legacy_public_history_and_rename_preserve_human_input_and_artifacts(tmp_path, monkeypatch):
    monkeypatch.setenv('ATLAS_DATA_DIR', str(tmp_path))
    from atlas.server import app

    store = Store()
    artifact = {'id': 'canvas-demo', 'revision': 2}
    rows = [
        {'role': 'user', 'content': '[SILENT]'},
        {'role': 'assistant', 'content': 'Use o marcador [SILENT].'},
        {'role': 'assistant', 'content': '[SILENT]', 'status': 'completed'},
        {'role': 'assistant', 'content': '[SILENT]', 'artifact': artifact},
        {'role': 'assistant', 'content': '[SILENT]', 'status': 'failed', 'warning': 'Erro de validação.'},
    ]
    store.put('conversation', 'history', {'id': 'history', 'title': 'Anterior', 'messages': rows})
    url = '/api/plugins/hermes-atlas/conversations/history'
    with TestClient(app, base_url='http://localhost') as client:
        viewed = client.get(url).json()['messages']
        assert viewed == client.patch(url, json={'title': 'Renomeada'}).json()['messages']
    assert viewed[:2] == rows[:2]
    assert viewed[2]['content'] == '' and viewed[2]['delivery'] == 'silent'
    assert viewed[3] == {**rows[3], 'content': ''}
    assert viewed[4] == {**rows[4], 'content': ''}


def follow_run(tmp_path, monkeypatch, status, events=(), initial=None):
    store = Store(tmp_path/'state.db')
    run = store.reserve('question', 'conversation', {}, '[SILENT]')
    store.checkpoint({**run, 'remote_id': 'run_test', **(initial or {})})
    calls = []

    async def request(method, path):
        calls.append((method, path))
        return {'run_id': 'run_test', **status}

    async def stream(*args):
        for event in events:
            yield event

    monkeypatch.setattr(gateway, 'request', request)
    monkeypatch.setattr(gateway, 'events', stream)
    asyncio.run(runs.follow(store, run['id']))
    asyncio.run(runs.follow(store, run['id']))
    assert calls == [('GET', '/runs/run_test')]
    chat = store.doc('conversation', 'conversation')
    assert chat['active_run'] is None and len(chat['messages']) == 2
    assert chat['messages'][0]['content'] == '[SILENT]'
    return runs.public(store.doc('run', run['id'])), chat['messages'][1]


def test_silent_completion_keeps_receipt_and_scope_can_continue(tmp_path, monkeypatch):
    run, message = follow_run(tmp_path, monkeypatch, {'status': 'completed', 'output': '  [silent]\n'})
    assert run['status'] == 'completed' and run['delivery'] == message['delivery'] == 'silent'
    assert run['text'] == message['content'] == '' and message['warning'] is None
    assert Store(tmp_path/'state.db').reserve('next', 'conversation', {}, 'Continuar')['status'] == 'submitting'


def test_terminal_event_can_supply_missing_final_and_is_private_during_stream(tmp_path, monkeypatch):
    run, message = follow_run(tmp_path, monkeypatch, {'status': 'completed'}, events=[
        {'type':'message.delta', 'seq': 0, 'delta':'Comentário preliminar.'},
        {'type':'run.completed', 'seq': 1, 'output':'Conteúdo definitivo.\n[SILENT]'},
    ])
    assert run['status'] == 'completed' and run['text'] == message['content'] == 'Conteúdo definitivo.'
    assert 'terminal_output' not in run
    assert 'terminal_output' not in runs.public({'status': 'running', 'text': '', 'terminal_output': '[SILENT]'})


def test_terminal_event_survives_recovery_without_creating_duplicate(tmp_path, monkeypatch):
    run, message = follow_run(tmp_path, monkeypatch, {'status':'completed'},
                              initial={'last_seq': 9, 'terminal_output': 'Resposta final.'})
    assert run['text'] == message['content'] == 'Resposta final.'


def test_partial_content_survives_missing_terminal_output_with_explicit_warning(tmp_path, monkeypatch):
    run, message = follow_run(tmp_path, monkeypatch, {'status':'completed'},
                              initial={'text':'Primeira parte.\n[SIL'})
    assert run['status'] == 'failed' and message['content'] == 'Primeira parte.'
    assert 'prévia' in message['warning'] and message['artifact'] is None


def test_empty_authoritative_final_never_promotes_interim_to_answer(tmp_path, monkeypatch):
    run, message = follow_run(tmp_path, monkeypatch, {'status':'completed','output':''},
                              initial={'text':'Vou pesquisar.'})
    assert run['status'] == 'failed' and message['content'] == '' and message['warning']
    assert 'delivery' not in run


@pytest.mark.parametrize('status', ['failed', 'interrupted', 'cancelled'])
def test_marker_does_not_hide_failure_or_cancellation(tmp_path, monkeypatch, status):
    run, message = follow_run(tmp_path, monkeypatch, {'status':status, 'output':'[SILENT]'})
    assert run['status'] == message['status'] == status
    assert message['content'] == '' and message['warning']
    assert 'delivery' not in message
