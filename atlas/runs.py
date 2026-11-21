import asyncio
import time
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from . import gateway
from .protocol import extract

TERMINAL = {'completed', 'failed', 'cancelled', 'interrupted'}
_tasks = {}


def public(run):
    return {k: v for k, v in run.items() if k != 'payload'}


def ensure(store, id):
    key = (str(store.path), store.scope, id)
    if key not in _tasks or _tasks[key].done():
        task = asyncio.create_task(follow(store, id))
        _tasks[key] = task
        task.add_done_callback(lambda done: _tasks.pop(key, None) if _tasks.get(key) is done else None)


async def shutdown():
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _tasks.clear()


async def follow(store, id):
    run = await asyncio.to_thread(store.doc, 'run', id)
    if not run or run['status'] in TERMINAL:
        return
    stream_task = None
    async def persist():
        await asyncio.to_thread(store.put, 'run', id, run)
    async def consume():
        try:
            async for event in gateway.events(run['remote_id'], run.get('last_seq', -1)):
                seq = event.get('seq')
                if isinstance(seq, int):
                    if seq <= run.get('last_seq', -1):
                        continue
                    run['last_seq'] = seq
                kind = event.get('type') or event.get('event', '')
                if kind == 'message.delta':
                    delta = event.get('delta')
                    if isinstance(delta, str):
                        run['text'] = (run['text'] + delta)[-1_000_000:]
                elif kind == 'message.interim' and not event.get('already_streamed'):
                    run['events'] = (run['events'] + [event])[-60:]
                elif kind.startswith(('tool.', 'subagent.', 'approval.', 'clarify.')):
                    run['events'] = (run['events'] + [event])[-60:]
                # Persist at the polling cadence below; avoid one SQLite write per token.
        except (Exception,):
            # Polling is authoritative when the transient event buffer has expired.
            return
    try:
        if not run['remote_id']:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(run['created'])).total_seconds()
            if age >= 23 * 3600:
                run.update(status='unknown', warning='A admissão ficou sem confirmação e a janela segura de repetição expirou. Verifique a sessão no Hermes antes de continuar.')
                await persist()
                return
            result = await gateway.request('POST', '/runs', {k: v for k, v in run['payload'].items() if not k.startswith('_atlas_')}, key='atlas-' + store.scope + '-' + id)
            remote = result.get('run_id')
            if not isinstance(remote, str) or not remote.startswith('run_') or len(remote) > 150:
                raise HTTPException(502, 'O gateway não retornou uma identidade de execução válida.')
            run.update(remote_id=remote, status=result.get('status', 'running'))
            await persist()
        stream_task = asyncio.create_task(consume())
        stream_started = time.monotonic()
        failures = 0
        while True:
            try:
                status = await gateway.request('GET', '/runs/' + run['remote_id'])
                if status.get('run_id') != run['remote_id'] or not isinstance(status.get('status'), str):
                    raise HTTPException(502, 'Estado de execução incompatível.')
                failures = 0
                for field in ('status', 'pending_controls', 'usage', 'runtime', 'admission_id', 'execution_generation', 'session_id'):
                    if field in status:
                        run[field] = status[field]
                run['connection_error'] = None
                if run['status'] in TERMINAL:
                    if stream_task:
                        stream_task.cancel()
                        await asyncio.gather(stream_task, return_exceptions=True)
                    run['text'] = status.get('output') or (run['text'] if run['status'] != 'completed' else '')
                    if run['status'] == 'completed':
                        try:
                            text, canvas, warning = extract(run['text'])
                            run.update(text=text, warning=warning)
                            if canvas:
                                context = run['payload'].get('_atlas_context')
                                canvas.id = context['id'] if context else 'canvas-' + uuid4().hex
                                run['artifact'] = await asyncio.to_thread(store.save, canvas, context['revision'] if context else 0, id)
                        except ValueError as exc:
                            run.update(status='failed', warning=str(exc))
                    elif not run['text']:
                        run['warning'] = {'cancelled': 'Execução interrompida.', 'interrupted': 'O gateway foi interrompido.'}.get(run['status'], 'O Hermes não concluiu a execução.')
                    await asyncio.to_thread(store.finish, run)
                    return
                await persist()
                if run['status'] == 'unknown':
                    return
                if stream_task.done() and time.monotonic() - stream_started > 5:
                    stream_task = asyncio.create_task(consume())
                    stream_started = time.monotonic()
                await asyncio.sleep(0.5)
            except HTTPException as exc:
                failures += 1
                run['connection_error'] = str(exc.detail)
                await persist()
                if failures >= 3:
                    return  # A subsequent GET resumes observation, never inference.
                await asyncio.sleep(min(failures * 2, 5))
    except HTTPException as exc:
        run['connection_error'] = str(exc.detail)
        if exc.status_code in {400,401,403,409,429} and not run['remote_id']:
            run.update(status='failed', warning=str(exc.detail))
            await asyncio.to_thread(store.finish, run)
        else:
            await persist()
    except Exception:
        run['connection_error'] = 'Falha ao acompanhar a execução. Reabra a conversa para consultar o estado no Hermes.'
        await persist()
    finally:
        if stream_task:
            stream_task.cancel()
            await asyncio.gather(stream_task, return_exceptions=True)
