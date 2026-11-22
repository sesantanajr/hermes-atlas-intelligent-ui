import json
from contextlib import closing
from uuid import uuid4

from fastapi.testclient import TestClient

from hermes_atlas.server import runs
from hermes_atlas.server.app import app
from hermes_atlas.storage.store import Store


def test_conditional_poll_replays_updates_and_recovers_after_restart(tmp_path, monkeypatch):
    monkeypatch.setenv('ATLAS_DATA_DIR', str(tmp_path))
    ensured = []
    monkeypatch.setattr(runs, 'ensure', lambda store, key: ensured.append(key))
    store = Store()
    run_id = str(uuid4())
    chat_id = str(uuid4())
    run = store.reserve(run_id, chat_id, {'input': 'private attachment'}, 'short question')
    run.update(status='running', text='Progresso. ' * 4000, remote_id='run_example')
    assert store.checkpoint(run)
    path = '/api/plugins/hermes-atlas/runs/' + run_id
    with TestClient(app, base_url='http://localhost') as client:
        full = client.get(path)
        first = full.json()
        assert first['text'] == run['text'] and 'payload' not in first
        assert len(full.content) > 40000
        same = client.get(path, params={'cursor': first['cursor']})
        assert same.json() == {'id': run_id, 'unchanged': True, 'cursor': first['cursor']}
        assert len(same.content) < 180
        assert ensured == [run_id, run_id]

        run.update(pending_controls=[{'kind': 'approval', 'prompt_id': 'p1'}])
        assert store.checkpoint(run)
        changed = client.get(path, params={'cursor': first['cursor']}).json()
        assert changed['cursor'] != first['cursor'] and changed['pending_controls']

        run.update(status='unknown')
        assert store.checkpoint(run)
        paused = client.get(path, params={'cursor': changed['cursor']}).json()
        before = len(ensured)
        assert client.get(path, params={'cursor': paused['cursor']}).json()['unchanged']
        assert len(ensured) == before
        store.resume_remote_unknown(run_id)
        resumed = client.get(path, params={'cursor': paused['cursor']}).json()
        assert resumed['status'] == 'running' and resumed['cursor'] != paused['cursor']

        run.update(status='completed', text='Fim', pending_controls=[])
        store.finish(run)
        completed = client.get(path, params={'cursor': resumed['cursor']}).json()
        assert completed['status'] == 'completed' and completed['text'] == 'Fim'
        # An older client can still ask for the full result every time.
        assert client.get(path).json() == completed
        assert client.get(path, headers={'X-Atlas-Workspace': 'outro'}).status_code == 409
        assert client.get(path[:-36] + str(uuid4()), params={'cursor': completed['cursor']}).status_code == 404


def test_unchanged_poll_skips_json_and_survives_clock_rollback(tmp_path, monkeypatch):
    store = Store(tmp_path / 'example.db')
    run = store.reserve('id', 'chat', {}, 'hello')
    with closing(store.connect()) as db, db:
        db.execute("UPDATE documents SET updated='2090-01-01T00:00:00.000000+00:00' WHERE kind='run'")
    first, value = store.observe('id')
    assert value['status'] == 'submitting'
    with monkeypatch.context() as patch:
        def unexpected_decode(*args):
            raise AssertionError('An unchanged observation must not decode the run document')
        patch.setattr(json, 'loads', unexpected_decode)
        assert store.observe('id', first) == (first, None)
    assert store.checkpoint({**run, 'text': 'changed'})
    second, changed = store.observe('id', first)
    assert first != second and changed['text'] == 'changed'
