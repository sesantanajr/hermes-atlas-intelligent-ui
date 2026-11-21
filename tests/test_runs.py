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
