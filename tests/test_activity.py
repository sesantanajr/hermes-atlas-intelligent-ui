import asyncio
import json

from hermes_atlas.server import gateway, runs
from hermes_atlas.chat.activity import step_event, summarize
from hermes_atlas.storage.store import Store


def terminal(seq, call_id, **fields):
    return {'type':'tool.completed','tool':'terminal','tool_call_id':call_id,'seq':seq,**fields}


def test_parallel_steps_keep_their_own_outcomes_without_exposing_raw_outputs():
    events = [
        {'type':'tool.started','tool':'terminal','tool_call_id':'a','seq':0,'preview':'command A'},
        {'type':'tool.started','tool':'terminal','tool_call_id':'b','seq':1,'preview':'command B'},
        terminal(2,'b',duration=91.0,error=True,preview='{"exit_code":124,"stdout":"private"}'),
        terminal(3,'a',duration=0.9,error=False),
    ]
    events.append(events[-1].copy())
    events.append({'type':'subagent.progress','preview':'private'})
    events.append({'type':[]})
    summary = summarize(events, terminal=True)
    assert summary == {'limited':False,'steps':[
        {'kind':'tool','name':'terminal','duration':0.9,'status':'succeeded'},
        {'kind':'tool','name':'terminal','duration':91,'status':'failed','reason':'timeout'},
    ]}
    rendered = runs.public({'status':'completed','text':'Medições obtidas','events':events})
    assert rendered['activity']==summary
    assert not any(s in json.dumps(rendered) for s in ('private','command A','command B'))


def test_missing_boundary_never_invents_success_or_a_timeout():
    events = [{'type':'tool.started','tool':'inspect','preview':'timeout after 90s'},
              {'type':'tool.completed','tool':'other','duration':95.0},
              {'type':'tool.failed','tool':'third','duration':90.0,'preview':'arbitrary output'}]
    assert [step['status'] for step in summarize(events)['steps']] == ['running','unknown','failed']
    done = summarize(events,limited=True,terminal=True)
    assert done['limited'] and all('reason' not in step for step in done['steps'])
    assert done['steps'][0]['status']=='unknown'


def test_delegations_match_batch_and_task_index_and_omit_free_text():
    shared = {'delegation_id':'batch','task_index':2}
    events = [{'event':'subagent.start',**shared,'goal':'private'},
              {'type':'subagent.complete',**shared,'child_session_id':'new','duration_seconds':2.8,
               'status':'completed','output_tail':'private'}]
    assert summarize(events)['steps']==[{'kind':'subagent','name':'Especialista','status':'succeeded','duration':2.8}]
    assert 'private' not in json.dumps(step_event(events[1]))


def test_final_poll_does_not_drop_tool_event_or_reclassify_completed_run(tmp_path, monkeypatch):
    store=Store(tmp_path/'db')
    run=store.reserve('request','chat',{},'Recursos do sistema')
    store.checkpoint({**run,'remote_id':'run_synthetic'})
    async def status(*args):
        return {'run_id':'run_synthetic','status':'completed','output':'Resumo disponível'}
    async def stream(*args):
        yield terminal(0,'a',duration=0.9,error=False)
        yield terminal(1,'b',duration=91.0,error=True,preview='{"exit_code":124}')
        yield {'type':'run.completed','seq':2,'output':'Resumo disponível'}
    monkeypatch.setattr(gateway,'request',status)
    monkeypatch.setattr(gateway,'events',stream)
    asyncio.run(runs.follow(store,'request'))
    saved = Store(tmp_path/'db').doc('conversation','chat')['messages'][-1]
    assert saved['status']=='completed' and saved['content']=='Resumo disponível'
    assert [s['status'] for s in saved['activity']['steps']]==['succeeded','failed']
    assert saved['activity']['steps'][1]['reason']=='timeout'
    # Data saved before 0.6 can still be projected without rewriting the chat.
    old = store.doc('conversation','chat')
    del old['messages'][-1]['activity']
    store.put('conversation','chat',old)
    assert store.doc('conversation','chat')['messages'][-1]['activity']==saved['activity']
