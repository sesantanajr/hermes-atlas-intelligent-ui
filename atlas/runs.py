import asyncio
import time
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from . import gateway
from .delivery import FAILURE_NOTICE, present_event, present_reply
from .protocol import extract

TERMINAL = {'completed', 'failed', 'cancelled', 'interrupted'}
_tasks = {}


def public(run):
    from .preview import decorate_live
    snapshot = {k: v for k, v in run.items() if k not in {'payload', 'request_hash', 'retry_window', 'terminal_output'}}
    if snapshot.get('events'):
        snapshot['events'] = [item for event in snapshot['events'] if (item := present_event(event)) is not None]
    return present_reply(snapshot, 'text') if run['status'] in TERMINAL else decorate_live(snapshot)


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
    if not run or run['status'] in TERMINAL or run['status'] == 'unknown':
        return
    stream_task = None
    stream_revision = 0
    async def persist():
        # Serialize a coherent snapshot; the SSE reader runs concurrently.
        return await asyncio.to_thread(store.checkpoint, run.copy())
    async def consume():
        nonlocal stream_revision
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
                elif kind == 'run.completed' and isinstance(event.get('output'), str):
                    run['terminal_output'] = event['output']
                    stream_revision += 1
                    return
                elif kind == 'message.interim' and not event.get('already_streamed'):
                    visible = present_event(event)
                    if visible is not None:
                        run['events'] = (run['events'] + [visible])[-60:]
                elif kind.startswith(('tool.', 'subagent.', 'approval.', 'clarify.')):
                    run['events'] = (run['events'] + [event])[-60:]
                stream_revision += 1
                # Persist at the polling cadence below; avoid one SQLite write per token.
        except (Exception,):
            # Polling is authoritative when the transient event buffer has expired.
            return
    try:
        if not run['remote_id']:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(run['created'])).total_seconds()
            if age >= run.get('retry_window', 23 * 3600):
                run.update(status='unknown', warning='A admissão ficou sem confirmação e a janela segura de repetição expirou. Verifique a sessão no Hermes antes de continuar.')
                await persist()
                return
            result = await gateway.request('POST', '/runs', {k: v for k, v in run['payload'].items() if not k.startswith('_atlas_')}, key='atlas-' + store.scope + '-' + id)
            remote = result.get('run_id')
            if not isinstance(remote, str) or not remote.startswith('run_') or len(remote) > 150:
                raise HTTPException(502, 'O gateway não retornou uma identidade de execução válida.')
            # A replay can return 'completed' before we have its final output.
            # Keep the local run observable until Store.finish commits both records.
            run.update(remote_id=remote, status='running')
            if not await persist():
                return
        stream_task = asyncio.create_task(consume())
        stream_started = time.monotonic()
        failures = 0
        saved_stream_revision = -1
        while True:
            try:
                status = await gateway.request('GET', '/runs/' + run['remote_id'])
                if status.get('run_id') != run['remote_id'] or not isinstance(status.get('status'), str):
                    raise HTTPException(502, 'Estado de execução incompatível.')
                failures = 0
                dirty = bool(run.get('connection_error'))
                for field in ('pending_controls', 'usage', 'runtime', 'admission_id', 'execution_generation', 'session_id'):
                    if field in status and status[field] != run.get(field):
                        run[field] = status[field]
                        dirty = True
                run['connection_error'] = None
                remote_status = status['status']
                if remote_status in TERMINAL:
                    # Both the terminal event and GET can carry the final result.
                    # If GET has none, let an in-flight terminal event arrive before detaching.
                    if (remote_status == 'completed' and status.get('output') is None
                            and 'terminal_output' not in run and stream_task and not stream_task.done()):
                        await asyncio.wait({stream_task}, timeout=0.5)
                    if stream_task:
                        stream_task.cancel()
                        await asyncio.gather(stream_task, return_exceptions=True)
                    final = dict(run, status=remote_status)
                    event_output = final.pop('terminal_output', None)
                    output = status.get('output')
                    if remote_status == 'completed' and output is None:
                        output = event_output
                    final['text'] = output if isinstance(output, str) else ''
                    if remote_status != 'completed' and not final['text']:
                        final['text'] = run['text']
                    if remote_status == 'completed':
                        try:
                            text, canvas, warning = extract(final['text'])
                            if canvas:
                                context = run['payload'].get('_atlas_context')
                                canvas.id = context['id'] if context else 'canvas-' + uuid4().hex
                                final['artifact'] = await asyncio.to_thread(store.save, canvas, context['revision'] if context else 0, id)
                            final.update(text=text, warning=warning)
                            if not text and not canvas and not warning:
                                final['delivery'] = 'silent'
                        except ValueError as exc:
                            final.update(status='failed', warning=str(exc))
                            if output is None and run['text']:
                                from .preview import decorate_live
                                preview = decorate_live({'text': run['text']})['text']
                                if preview.strip():
                                    final.update(text=preview, warning='O Hermes confirmou a conclusão sem fornecer a resposta final. O texto exibido é uma prévia recuperada.')
                    else:
                        final['warning'] = final.get('warning') or FAILURE_NOTICE[remote_status]
                    await asyncio.to_thread(store.finish, final)
                    return
                dirty = dirty or run['status'] != remote_status
                run['status'] = remote_status
                if dirty or stream_revision != saved_stream_revision:
                    saved_stream_revision = stream_revision
                    if not await persist():
                        return
                if remote_status == 'unknown':
                    return
                if stream_task.done() and time.monotonic() - stream_started > 5:
                    stream_task = asyncio.create_task(consume())
                    stream_started = time.monotonic()
                await asyncio.sleep(0.5)
            except HTTPException as exc:
                failures += 1
                if run.get('connection_error') != str(exc.detail):
                    run['connection_error'] = str(exc.detail)
                    if not await persist():
                        return
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
