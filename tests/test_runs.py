import asyncio
import json
import time
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from atlas import gateway
from atlas.models import Canvas
from atlas.protocol import extract, INSTRUCTIONS
from atlas.store import Store
from atlas import runs
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from fastapi import HTTPException

BASE='/api/plugins/hermes-atlas'
CAPS={'object':'hermes.api_server.capabilities','platform':'hermes-agent','model':'test-hermes','features':{'run_submission':True,'run_status':True,'run_events_sse':True,'run_stop':True,'runs_idempotency':{'durable':True}}}

def canvas():
    return {'id':'example','title':'Example','blocks':[{'id':'note','type':'text','title':'Note','text':'Literal ``` in JSON, not an ending fence.'}]}

class Hermes:
    def __init__(self):
        self.calls=[]
        self.state='completed'
        self.output='Done.\n```atlas\n'+json.dumps(canvas())+'\n```'
        self.bad_caps=False
    def handle(self,r):
        path=r.url.path
        if path.endswith('/capabilities'):
            return httpx.Response(200,text='<html>login</html>') if self.bad_caps else httpx.Response(200,json=CAPS)
        if path.endswith('/runs'):
            self.calls.append((r.headers.get('Idempotency-Key'),json.loads(r.content)))
            return httpx.Response(202,json={'run_id':'run_test','status':'queued'})
        if path.endswith('/events'):
            return httpx.Response(200,headers={'Content-Type':'text/event-stream'},text=': keepalive\n\ndata: {"event":"message.delta","delta":"Hello","seq":0}\n\n')
        if path.endswith('/stop'):
            self.state='cancelled'
            return httpx.Response(200,json={'status':'stopping'})
        if path.endswith('/approval'):
            body=json.loads(r.content)
            assert body=={'request_id':'approve-1','execution_generation':7,'choice':'deny'}
            self.state='completed'
            return httpx.Response(200,json={'resolved':1})
        return httpx.Response(200,json={'run_id':'run_test','status':self.state,'output':self.output if self.state=='completed' else '', 'pending_controls':[{'prompt_id':'approve-1','execution_generation':7,'kind':'approval','description':'Test command'}] if self.state=='waiting_for_approval' else []})

@pytest.fixture
def runtime(tmp_path,monkeypatch):
    from atlas.server import app
    monkeypatch.setenv('ATLAS_DATA_DIR',str(tmp_path))
    monkeypatch.delenv('ATLAS_HERMES_URL',raising=False)
    gateway._capabilities.clear()
    fake=Hermes()
    client=httpx.AsyncClient(transport=httpx.MockTransport(fake.handle))
    monkeypatch.setattr(gateway,'client',lambda:client)
    with TestClient(app,base_url='http://localhost') as browser:
        yield browser,fake
    asyncio.run(client.aclose())

def create(browser,conversation=None,text='Create a canvas'):
    body={'request_id':str(uuid4()),'conversation_id':conversation or str(uuid4()),'input':text}
    response=browser.post(BASE+'/runs',json=body)
    assert response.status_code==202,response.text
    return body,response.json()

def finished(browser,id):
    for _ in range(100):
        r=browser.get(BASE+'/runs/'+id).json()
        if r['status'] in {'completed','failed','cancelled','interrupted'}:return r
        time.sleep(.02)
    raise AssertionError(r)

def test_real_contract_and_idempotent_canvas(runtime):
    browser,fake=runtime
    body,run=create(browser)
    result=finished(browser,run['id'])
    assert result['status']=='completed'
    assert result['text']=='Done.'
    assert result['artifact']['revision']==1
    assert '```' in result['artifact']['canvas']['blocks'][0]['text']
    assert browser.post(BASE+'/runs',json=body).status_code==202
    assert len(fake.calls)==1
    assert fake.calls[0][1]['model']=='test-hermes'
    assert 'conversation_history' not in fake.calls[0][1]
    assert '_atlas_context' not in fake.calls[0][1]
    assert len(browser.get(BASE+'/conversations/'+body['conversation_id']).json()['messages'])==2

def test_26th_turn_continues_server_session(runtime):
    browser,fake=runtime
    cid=str(uuid4())
    for n in range(26):
        _,run=create(browser,cid,str(n));finished(browser,run['id'])
    assert len(fake.calls)==26
    assert len({p['session_id'] for _,p in fake.calls})==1
    assert max(len(json.dumps(p)) for _,p in fake.calls)<2000
    assert len(browser.get(BASE+'/conversations/'+cid).json()['messages'])==52

def test_cancel_remains_tracked_until_gateway_confirms(runtime):
    browser,fake=runtime;fake.state='running'
    _,run=create(browser)
    for _ in range(50):
        current=browser.get(BASE+'/runs/'+run['id']).json()
        if current['remote_id']:break
        time.sleep(.02)
    assert browser.post(BASE+'/runs/'+run['id']+'/stop',json={}).status_code==200
    assert finished(browser,run['id'])['status']=='cancelled'
    assert len(fake.calls)==1

def test_approval_is_explicit_and_identity_bound(runtime):
    browser,fake=runtime;fake.state='waiting_for_approval'
    _,run=create(browser)
    for _ in range(50):
        current=browser.get(BASE+'/runs/'+run['id']).json()
        if current.get('pending_controls'):break
        time.sleep(.02)
    path=BASE+'/runs/'+run['id']+'/approval'
    assert browser.post(path,json={}).status_code==422
    assert browser.post(path,json={'request_id':'approve-1','execution_generation':7,'choice':'deny'}).status_code==200
    assert finished(browser,run['id'])['status']=='completed'

@pytest.mark.parametrize('output',['','   '])
def test_empty_output_never_becomes_canvas_created(runtime,output):
    browser,fake=runtime;fake.output=output
    _,run=create(browser)
    r=finished(browser,run['id'])
    assert r['status']=='failed' and not r['artifact']

def test_html_200_is_not_connected(runtime):
    browser,fake=runtime;fake.bad_caps=True
    assert browser.get(BASE+'/status').json()['connected'] is False

def test_profile_fence_rejects_stale_browser(runtime):
    browser,_=runtime
    assert browser.get(BASE+'/conversations',headers={'X-Atlas-Workspace':'old-profile'}).status_code==409
    assert browser.put(BASE+'/workspace?atlas_scope=old-profile',json={}).status_code==409

def test_revision_conflict_and_pinned_history(runtime):
    browser,_=runtime
    first=browser.post(BASE+'/canvases',json=canvas()).json()
    changed=canvas();changed['title']='Changed'
    assert browser.post(BASE+'/canvases',json=changed).status_code==409
    assert browser.post(BASE+'/canvases?expected_revision=1',json=changed).json()['revision']==2
    assert browser.get(BASE+'/canvases/example?revision=1').json()==first

def test_workspace_roundtrips_interactions(runtime):
    browser,_=runtime
    c=canvas();c['state']={'note':{'query':'retained'}}
    w={'canvas':c,'revision':0,'chat_id':None,'theme':'dark'}
    assert browser.put(BASE+'/workspace',json=w).status_code==200
    assert browser.get(BASE+'/workspace').json()['canvas']['state']['note']['query']=='retained'


def test_workspace_compare_and_swap_and_legacy_echo(runtime):
    browser, _ = runtime
    url = BASE + '/workspace'
    old_tab = browser.get(url).json()
    token = old_tab['workspace_token']
    barrier = Barrier(2)

    def edit(theme):
        barrier.wait()
        return browser.put(url, json={**old_tab, 'theme': theme, 'expected_workspace_token': token})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(edit, ['dark', 'light']))
    assert sorted(r.status_code for r in responses) == [200, 409]
    saved = next(r.json() for r in responses if r.status_code == 200)
    assert saved == browser.get(url).json()
    assert saved['workspace_token'] != token
    # A retry whose acknowledgement was lost succeeds without overwriting newer content.
    assert browser.put(url, json={**saved, 'expected_workspace_token': token}).json() == saved
    # v0.2 clients replay the whole boot snapshot and do not consume PUT responses.
    assert browser.put(url, json={**old_tab, 'theme': 'dark'}).status_code == 200
    assert browser.put(url, json={**old_tab, 'theme': 'light'}).status_code == 200
    assert browser.get(url).json()['theme'] == 'light'

def test_bad_canvas_is_preserved_as_text():
    text='```atlas\n{"type":"html"}\n```'
    answer,c,warning=extract(text)
    assert answer==text and c is None and warning

def test_different_conversations_cannot_collide(runtime):
    browser,_=runtime
    _,a=create(browser);a=finished(browser,a['id'])
    _,b=create(browser);b=finished(browser,b['id'])
    assert a['artifact']['id']!=b['artifact']['id']

def test_save_after_lost_finalize_is_idempotent(tmp_path):
    store=Store(tmp_path/'db')
    c=Canvas.model_validate(canvas())
    assert store.save(c,0,'same-run')==store.save(c,0,'same-run')
    assert len(store.versions(c.id))==1

def test_prompt_contract_stays_compact():
    assert len(INSTRUCTIONS)<1800


def test_replayed_terminal_is_not_committed_until_result_is_durable(tmp_path, monkeypatch):
    store = Store(tmp_path / 'runs.db')
    request_id, chat_id = str(uuid4()), str(uuid4())
    store.reserve(request_id, chat_id, {}, 'original')
    upstream_posts = []
    unavailable = True

    async def request(method, path, *args, **kwargs):
        if method == 'POST':
            upstream_posts.append(path)
            return {'run_id': 'run_replay', 'status': 'completed'}
        if unavailable:
            raise HTTPException(503, 'offline')
        return {'run_id': 'run_replay', 'status': 'completed', 'output': 'Recovered result'}

    async def no_wait(*args):
        return

    async def empty_stream(*args):
        for event in []:
            yield event

    monkeypatch.setattr(gateway, 'request', request)
    monkeypatch.setattr(gateway, 'events', empty_stream)
    monkeypatch.setattr(runs.asyncio, 'sleep', no_wait)
    asyncio.run(runs.follow(store, request_id))
    assert store.doc('run', request_id)['status'] == 'running'
    assert store.doc('conversation', chat_id)['active_run'] == request_id
    unavailable = False
    asyncio.run(runs.follow(store, request_id))
    assert upstream_posts == ['/runs']
    assert store.doc('conversation', chat_id)['messages'][-1]['content'] == 'Recovered result'
    assert store.doc('conversation', chat_id)['active_run'] is None


def test_expired_admission_can_be_acknowledged_without_resubmission(runtime):
    browser, fake = runtime
    store = Store()
    rid, cid = str(uuid4()), str(uuid4())
    run = store.reserve(rid, cid, {}, 'old request')
    run['created'] = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    store.put('run', rid, run)
    asyncio.run(runs.follow(store, rid))
    assert store.doc('run', rid)['status'] == 'unknown'
    assert browser.post(f'{BASE}/runs/{rid}/stop', json={}).status_code == 409
    assert browser.post(f'{BASE}/runs/{rid}/resolve-unknown', json={}).json()['status'] == 'interrupted'
    assert not fake.calls
    assert store.doc('conversation', cid)['active_run'] is None
    _, new_run = create(browser, cid)
    assert finished(browser, new_run['id'])['status'] == 'completed'


def test_conversation_delete_retires_sensitive_run_payload_and_blocks_replay(runtime):
    browser, fake = runtime
    store = Store()
    request = {'request_id': str(uuid4()), 'conversation_id': str(uuid4()), 'input': 'private prompt',
               'attachments': [{'name': 'report.txt', 'text': 'private attachment'}]}
    run = browser.post(BASE + '/runs', json=request).json()
    artifact = finished(browser, run['id'])['artifact']
    path = BASE + '/conversations/' + request['conversation_id']
    assert browser.request('DELETE', path, json={}).status_code == 200
    assert browser.get(BASE + '/runs/' + run['id']).status_code == 404
    assert browser.get(path).status_code == 404
    assert store.doc('artifact_run', run['id']) is None
    assert store.doc('deleted_run', run['id']) == {}
    assert store.get(artifact['id'], artifact['revision']) is not None
    assert browser.post(BASE + '/runs', json=request).status_code == 409
    assert browser.post(BASE + '/runs', json=dict(request, conversation_id=str(uuid4()))).status_code == 409
    assert len(fake.calls) == 1


def test_migrates_old_orphans_and_incomplete_terminal_runs(tmp_path):
    path = tmp_path / 'upgrade.db'
    store = Store(path)
    rid, cid = str(uuid4()), str(uuid4())
    run = store.reserve(rid, cid, {}, 'keep me')
    store.put('run', rid, dict(run, status='completed', remote_id='run_replay'))
    old_id = str(uuid4())
    store.put('run', old_id, dict(run, id=old_id, conversation_id='removed-chat'))
    store.put('artifact_run', old_id, {'sensitive': 'copy'})
    with closing(store.connect()) as db:
        db.execute("PRAGMA user_version=0")
    migrated = Store(path)
    assert migrated.doc('run', rid)['status'] == 'running'
    assert migrated.doc('conversation', cid)['active_run'] == rid
    assert migrated.doc('run', old_id) is None
    assert migrated.doc('artifact_run', old_id) is None
    assert migrated.doc('deleted_run', old_id) == {}
    assert migrated.doc('deleted_conversation', 'removed-chat') == {}


def test_rename_and_completion_do_not_lose_each_others_changes(tmp_path):
    store = Store(tmp_path / 'concurrent.db')
    rid, cid = str(uuid4()), str(uuid4())
    run = store.reserve(rid, cid, {}, 'hello')
    with pytest.raises(ValueError):
        store.delete_conversation(cid)
    barrier = Barrier(2)
    def rename():
        barrier.wait(timeout=5)
        store.rename_conversation(cid, 'renamed')
    def finish():
        barrier.wait(timeout=5)
        store.finish(dict(run, status='completed', text='answer'))
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(rename), pool.submit(finish)]
        for future in futures:
            future.result()
    chat = store.doc('conversation', cid)
    assert chat['title'] == 'renamed' and chat['active_run'] is None
    assert [message['content'] for message in chat['messages']] == ['hello', 'answer']


def test_search_finds_older_titles_before_paginating(runtime):
    browser, _ = runtime
    store = Store()
    for i in range(56):
        store.put('conversation', str(i), {'id': str(i), 'title': 'Título alvo' if i < 2 else 'Outra',
                                          'messages': [{'role': 'user', 'content': 'large payload'}]})
    page = browser.get(BASE + '/conversations', params={'q': 'TÍTULO', 'limit': 1, 'offset': 1}).json()
    assert len(page) == 1 and page[0]['title'] == 'Título alvo' and 'messages' not in page[0]
