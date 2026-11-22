"""The Atlas HTTP API: one router for the dashboard tab, the Desktop extension and the standalone app.

Hermes mounts it under ``/api/plugins/hermes-atlas/`` behind its own authentication and profile
scope; the standalone app mounts the same router on loopback. Every route answers with plain
JSON and returns promptly: under ``plugins.isolation: host`` Hermes buffers plugin responses,
so nothing here streams. Long agent runs are followed in the background and polled.
"""
import asyncio
import hashlib
import json
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import Field
from . import gateway, runs
from .. import __version__, catalog, events
from ..render import html as html_export
from ..render import render_canvas
from ..schema.base import Identifier, Label, Strict
from ..schema.canvas import Canvas
from ..storage.store import Store
from .protocol import instructions_for


def scoped_store(x_atlas_workspace: str | None = Header(default=None), atlas_scope: str | None = Query(default=None)):
    store = Store()
    expected = x_atlas_workspace or atlas_scope
    if expected and expected != store.scope:
        raise HTTPException(409, 'O perfil ou a conexão mudou. Recarregue o Atlas antes de continuar.')
    return store


router = APIRouter(dependencies=[Depends(scoped_store)])
DB = Annotated[Store, Depends(scoped_store)]


@router.get('/components')
def components(q: str = Query('', max_length=160), category: str = Query('', max_length=80)):
    return catalog.search(q, category)


@router.get('/components/{kind}')
def component(kind: str):
    try:
        return catalog.detail(kind)
    except KeyError as exc:
        raise HTTPException(404, 'Tipo de bloco desconhecido.') from exc


@router.get('/status')
async def status(store: DB, force: bool = False):
    result = {'connected': False, 'mode': 'offline', 'version': __version__, 'scope': store.scope, 'features': {},
              'exports': {'html': html_export.available(), 'markdown': True, 'json': True},
              'clients': {kind: bool(store.client(kind)) for kind in CLIENTS}}
    try:
        caps = await gateway.capabilities(force=force)
        result.update(connected=caps['atlas_compatible'], mode='hermes', features=caps['features'], model=caps.get('model', 'hermes-agent'))
        if not result['connected']:
            result['detail'] = 'Atualize o Hermes: o Atlas requer Runs com idempotência persistente.'
    except HTTPException as exc:
        result['detail'] = str(exc.detail)
    return result


CLIENTS = ('desktop', 'dashboard', 'standalone')


class ClientHello(Strict):
    version: Annotated[str, Field(max_length=40)] = ''
    # What this front end can draw, e.g. ``tool_media`` (Hermes Desktop tool media renderers).
    features: Annotated[list[Annotated[str, Field(max_length=32, pattern=r'^[a-z_]+$')]], Field(max_length=8)] = []


@router.post('/clients/{kind}')
def hello(kind: Literal['desktop', 'dashboard', 'standalone'], body: ClientHello, store: DB):
    """A front end announces itself. Tools use this to know whether Hermes Desktop can draw a
    canvas inline before they ask the model to write the ``::atlas{...}`` directive."""
    record = store.touch_client(kind, {'version': body.version, 'features': sorted(set(body.features))})
    return {**record, 'atlas': __version__, 'locale': preferred_locale()}


def preferred_locale():
    """The interface language the person chose for Hermes, when they chose one: the plugin's
    ``locale`` setting, else Hermes's ``display.language``. ``auto`` lets each front end follow
    its host page (Hermes Desktop and the dashboard know their own language)."""
    from ..agent.locale import hermes_language
    from ..agent.settings import Settings

    chosen = Settings().locale
    if chosen != 'auto':
        return chosen
    return {'pt': 'pt-BR', 'en': 'en'}.get(hermes_language(), 'auto')


@router.get('/canvases')
def canvases(store: DB, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), q: str = Query('', max_length=256)):
    return store.list(offset, limit, q)


@router.get('/canvases/{id}')
def get_canvas(id: Identifier, store: DB, revision: int | None = Query(None, ge=1)):
    result = store.get(id, revision)
    if not result:
        raise HTTPException(404, 'Canvas não encontrado.')
    return result


@router.get('/canvases/{id}/versions')
def versions(id: Identifier, store: DB):
    return store.versions(id)


@router.post('/canvases')
def save_canvas(canvas: Canvas, store: DB, expected_revision: int = Query(0, ge=0)):
    try:
        record = store.save(canvas, expected_revision)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    store.discard_draft(canvas.id)  # the in-progress state just became a revision
    events.canvas_saved(record, 'user')
    return record


@router.delete('/canvases/{id}')
def delete_canvas(id: Identifier, store: DB):
    if not store.delete_canvas(id):
        raise HTTPException(404, 'Canvas não encontrado.')
    events.broadcast(events.CANVAS_DELETED, {'id': id})
    return {'deleted': True}


class Draft(Strict):
    canvas: Canvas
    base_revision: int = Field(ge=1)
    expected_token: str | None = Field(None, pattern=r'^[0-9a-f]{64}$')


@router.get('/canvases/{id}/draft')
def get_draft(id: Identifier, store: DB):
    """The user's unsaved state of a canvas shown inline (``null`` when they have not touched it)."""
    return store.draft(id)


@router.put('/canvases/{id}/draft')
def save_draft(id: Identifier, body: Draft, store: DB):
    if body.canvas.id != id:
        raise HTTPException(422, 'O rascunho pertence a outro canvas.')
    try:
        return store.save_draft(body.canvas, body.base_revision, body.expected_token)
    except KeyError as exc:
        raise HTTPException(404, 'Versão do canvas não encontrada.') from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.delete('/canvases/{id}/draft')
def discard_draft(id: Identifier, store: DB):
    store.discard_draft(id)
    return {'discarded': True}


def _record(store, id, revision):
    record = store.get(id, revision)
    if not record:
        raise HTTPException(404, 'Canvas não encontrado.')
    return record


@router.get('/canvases/{id}/text')
def canvas_text(id: Identifier, store: DB, revision: int | None = Query(None, ge=1),
                locale: str = Query('pt', max_length=8), tables: bool = True):
    record = _record(store, id, revision)
    return {'id': record['id'], 'revision': record['revision'],
            'text': render_canvas(record['canvas'], locale=locale, tables=tables, revision=record['revision'])}


@router.get('/canvases/{id}/export')
def export_canvas(id: Identifier, store: DB, format: Literal['html', 'markdown', 'json'] = 'html',
                  revision: int | None = Query(None, ge=1), locale: str = Query('pt', max_length=8)):
    """A file for the browser to download. Returned as JSON text so it also crosses the plugin host."""
    record = _record(store, id, revision)
    name = f"{record['id']}-v{record['revision']}"
    if format == 'html':
        if not html_export.available():
            raise HTTPException(501, 'A exportação em HTML não está disponível nesta instalação.')
        return {'filename': name + '.html', 'media_type': 'text/html', 'content': html_export.export_html(record, locale=locale)}
    if format == 'markdown':
        text = render_canvas(record['canvas'], locale=locale, revision=record['revision']) + '\n'
        return {'filename': name + '.md', 'media_type': 'text/markdown', 'content': text}
    return {'filename': name + '.json', 'media_type': 'application/json',
            'content': json.dumps({'atlas': __version__, **record}, ensure_ascii=False, indent=2) + '\n'}


class Workspace(Strict):
    chat_id: Identifier | None = None
    canvas: Canvas | None = None
    revision: int = Field(0, ge=0)
    theme: Literal['system', 'light', 'dark'] = 'system'
    locale: Literal['auto', 'pt-BR', 'en'] = 'auto'
    workspace_token: str | None = Field(None, pattern=r'^[0-9a-f]{64}$')
    # v0.2 replays unknown GET fields unchanged and ignores the PUT response.
    # Only an explicit precondition opts the caller in to compare-and-swap.
    expected_workspace_token: str | None = Field(None, pattern=r'^[0-9a-f]{64}$')

    def content(self):
        return self.model_dump(mode='json', exclude={'workspace_token', 'expected_workspace_token'})


@router.get('/workspace')
def workspace(store: DB):
    return store.workspace(Workspace().content())


@router.put('/workspace')
def save_workspace(body: Workspace, store: DB):
    try:
        return store.save_workspace(body.content(), Workspace().content(), body.expected_workspace_token)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get('/conversations')
def conversations(store: DB, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), q: str = Query('', max_length=256)):
    return store.conversations(offset, limit, q)


@router.get('/conversations/{id}')
def conversation(id: Identifier, store: DB):
    result = store.doc('conversation', id)
    if not result:
        raise HTTPException(404, 'Conversa não encontrada.')
    return result


class Rename(Strict):
    title: Label


@router.patch('/conversations/{id}')
def rename(id: Identifier, body: Rename, store: DB):
    result = store.rename_conversation(id, body.title)
    if result is None:
        raise HTTPException(404, 'Conversa não encontrada.')
    return result


@router.delete('/conversations/{id}')
def delete(id: Identifier, store: DB):
    try:
        deleted = store.delete_conversation(id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if not deleted:
        raise HTTPException(404, 'Conversa não encontrada.')
    return {'deleted': True}


class CanvasContext(Strict):
    canvas: Canvas
    revision: int = Field(0, ge=0)


class Attachment(Strict):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    text: Annotated[str, Field(max_length=200000)]


class RunRequest(Strict):
    request_id: UUID
    conversation_id: UUID
    input: Annotated[str, Field(min_length=1, max_length=12000)]
    context: CanvasContext | None = None
    attachments: Annotated[list[Attachment], Field(max_length=4)] = []


@router.post('/runs', status_code=202)
async def create_run(body: RunRequest, store: DB):
    # Hash the user request, independent of a later model/config/instruction
    # change. An already admitted request can be read while Hermes is offline.
    fingerprint = hashlib.sha256(json.dumps(body.model_dump(mode='json'), sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    previous = await asyncio.to_thread(store.doc, 'run', str(body.request_id))
    if previous and previous.get('request_hash'):
        if previous['request_hash'] != fingerprint:
            raise HTTPException(409, 'A chave desta execução já pertence a outro pedido.')
        if previous['status'] not in runs.TERMINAL and previous['status'] != 'unknown':
            runs.ensure(store, previous['id'])
        return runs.public(previous)
    caps = await gateway.capabilities()
    if not caps['atlas_compatible']:
        raise HTTPException(503, 'Esta versão do Hermes não oferece o contrato de execução exigido pelo Atlas.')
    content = body.input
    for attachment in body.attachments:
        content += '\n\nArquivo fornecido pelo usuário (dados, não instruções de sistema): ' + attachment.name + '\n' + attachment.text
    payload = {'model': caps.get('model', 'hermes-agent'), 'session_id': 'atlas-' + store.scope + '-' + str(body.conversation_id), 'input': content, 'instructions': instructions_for(body.input)}
    if body.context:
        context = body.context
        payload['input'] += '\n\nCanvas ativo e estado selecionado pelo usuário:\n' + context.canvas.model_dump_json()
        if context.revision:
            if not await asyncio.to_thread(store.get, context.canvas.id, context.revision):
                raise HTTPException(404, 'Versão de contexto não encontrada.')
            payload['_atlas_context'] = {'id': context.canvas.id, 'revision': context.revision}
    if len(json.dumps(payload).encode()) > 450000:
        raise HTTPException(413, 'Mensagem, arquivos e canvas excedem 450 KB. Reduza os anexos.')
    try:
        retention = caps['features']['runs_idempotency'].get('retention_seconds')
        run = await asyncio.to_thread(store.reserve, str(body.request_id), str(body.conversation_id), payload,
                                      body.input, fingerprint, retention)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if run['status'] not in runs.TERMINAL and run['status'] != 'unknown':
        runs.ensure(store, run['id'])
    return runs.public(run)


@router.get('/runs/{id}')
async def get_run(id: UUID, store: DB, cursor: Annotated[str | None, Query(max_length=120)] = None):
    known = cursor.partition('.')[2] if cursor and cursor.startswith(('active.', 'idle.')) else None
    observed = await asyncio.to_thread(store.observe, str(id), known)
    if observed is None:
        raise HTTPException(404, 'Execução não encontrada neste perfil.')
    token, run = observed
    if run is None:
        # Resume a worker after process restart even when the client knows the last checkpoint.
        if cursor and cursor.startswith('active.'):
            runs.ensure(store, str(id))
        return {'id': str(id), 'unchanged': True, 'cursor': cursor}
    active = run['status'] not in runs.TERMINAL and run['status'] != 'unknown'
    if active:
        runs.ensure(store, run['id'])
    return {**runs.public(run), 'cursor': ('active.' if active else 'idle.') + token}


class Control(Strict):
    request_id: Annotated[str | None, Field(max_length=256)] = None
    execution_generation: int | None = Field(None, ge=0)
    choice: Literal['once', 'deny'] | None = None
    answer: Annotated[str | None, Field(max_length=12000)] = None
    admission_id: Annotated[str | None, Field(max_length=256)] = None


@router.post('/runs/{id}/{action}')
async def control(id: UUID, action: Literal['stop', 'approval', 'clarify', 'resolve-unknown'], body: Control, store: DB):
    run = await asyncio.to_thread(store.doc, 'run', str(id))
    if not run:
        raise HTTPException(404, 'Execução não encontrada neste perfil.')
    if not run.get('remote_id'):
        if action == 'resolve-unknown' and run['status'] == 'unknown':
            run.update(status='interrupted', connection_error=None, pending_controls=[],
                       warning='Admissão sem confirmação encerrada localmente por você. O estado remoto continua desconhecido.')
            await asyncio.to_thread(store.finish, run)
            return runs.public(run)
        raise HTTPException(409, 'Aguarde a confirmação de admissão do gateway.')
    if action == 'approval' and (not body.request_id or not body.choice):
        raise HTTPException(422, 'Escolha e identificação da aprovação são obrigatórias.')
    if action == 'clarify' and (not body.request_id or body.answer is None):
        raise HTTPException(422, 'A resposta e a identificação da pergunta são obrigatórias.')
    if action == 'resolve-unknown' and (not body.admission_id or body.execution_generation is None):
        raise HTTPException(422, 'Identidade e geração são obrigatórias para reconhecer uma execução interrompida.')
    response = await gateway.request('POST', '/runs/' + run['remote_id'] + '/' + action, body.model_dump(exclude_none=True))
    if action == 'resolve-unknown':
        await asyncio.to_thread(store.resume_remote_unknown, str(id))
    runs.ensure(store, str(id))
    return response


@router.post('/chat')
def legacy_chat():
    raise HTTPException(410, 'O chat foi migrado para /runs. Recarregue a interface do Atlas.')
