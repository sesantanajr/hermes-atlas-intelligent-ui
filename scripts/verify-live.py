"""Opt-in live test. Sends synthetic prompts to the user's configured Hermes.
Usage: python scripts/verify-live.py --base http://127.0.0.1:7331 --output result.json
"""
import argparse
import json
import time
import urllib.request
from pathlib import Path
from uuid import uuid4

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='http://127.0.0.1:7331')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    base=args.base.rstrip('/')+'/api/plugins/hermes-atlas'
    def request(path,body=None):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
    result={'gateway':request('/status'),'checks':[]}
    assert result['gateway']['connected'], result['gateway']
    def start(cid,text):
        body={'request_id':str(uuid4()),'conversation_id':cid,'input':text}
        before=time.perf_counter();run=request('/runs',body)
        assert request('/runs',body)['id']==run['id']
        return body,run,before
    def finish(run,before):
        first_delta=None
        for _ in range(180):
            run=request('/runs/'+run['id'])
            if run.get('text') and first_delta is None:first_delta=time.perf_counter()-before
            if run['status'] in {'completed','failed','cancelled','interrupted'}:
                return run,{'seconds':round(time.perf_counter()-before,3),'first_observed_text_seconds':round(first_delta,3) if first_delta is not None else None}
            time.sleep(.5)
        raise RuntimeError('Run did not settle; inspect it in Hermes: '+run['id'])
    cid=str(uuid4());code='ATLAS-'+uuid4().hex[:8]
    body,run,before=start(cid,f'Teste sintético de continuidade do Atlas. Não use ferramentas. Guarde o código {code} nesta conversa e responda apenas com o código.')
    first,timing=finish(run,before);assert first['status']=='completed' and code in first['text'],first
    result['checks'].append({'name':'first_live_turn','passed':True,**timing})
    _,run,before=start(cid,'Sem usar ferramentas: qual é o código que pedi para guardar na mensagem anterior? Responda apenas com ele.')
    second,timing=finish(run,before);assert second['status']=='completed' and code in second['text'],second
    result['checks'].append({'name':'server_session_continuity','passed':True,**timing})
    assert request('/runs',body)['id']==first['id']
    messages=request('/conversations/'+cid)['messages'];assert len(messages)==4
    result['checks'].append({'name':'idempotent_replay_after_completion','passed':True})
    _,run,before=start(str(uuid4()),'Teste de cancelamento. Sem ferramentas, escreva uma lista longa de 200 ideias fictícias para nomes de cores, com uma frase por item.')
    for _ in range(50):
        run=request('/runs/'+run['id'])
        if run.get('remote_id'):break
        time.sleep(.1)
    request('/runs/'+run['id']+'/stop',{})
    stopped,timing=finish(run,before);assert stopped['status']=='cancelled',stopped
    result['checks'].append({'name':'remote_cancellation','passed':True,**timing})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result['checks'],ensure_ascii=False,indent=2))

if __name__=='__main__':main()
