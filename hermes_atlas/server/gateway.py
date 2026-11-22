"""Public Hermes Runs API adapter. Credentials stay on the server."""
import asyncio
import hashlib
import json
import time
from urllib.parse import urlsplit
from weakref import WeakKeyDictionary
import httpx
from fastapi import HTTPException

from ..runtime import api_server_key, gateway_url, profile_home, setting  # noqa: F401  (re-exported for callers)

_clients = WeakKeyDictionary()
_capabilities = {}
_probes = WeakKeyDictionary()


def upstream():
    url = gateway_url(profile_home())
    p = urlsplit(url)
    if p.scheme not in {'http', 'https'} or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise HTTPException(503, 'ATLAS_HERMES_URL inválida.')
    if p.scheme == 'http' and p.hostname not in {'localhost', '127.0.0.1', '::1'}:
        raise HTTPException(503, 'Use HTTPS ou um túnel local para o Hermes remoto.')
    key = api_server_key()
    return url, {'Authorization': f'Bearer {key}'} if key else {}


def client():
    loop = asyncio.get_running_loop()
    if loop not in _clients or _clients[loop].is_closed:
        _clients[loop] = httpx.AsyncClient(timeout=httpx.Timeout(20, connect=5), limits=httpx.Limits(max_connections=20, max_keepalive_connections=10), follow_redirects=False)
    return _clients[loop]


async def close():
    loop = asyncio.get_running_loop()
    pending = tuple(_probes.pop(loop, {}).values())
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    c = _clients.pop(loop, None)
    if c:
        await c.aclose()


async def request(method, path, body=None, key=None):
    url, headers = upstream()
    if key:
        headers['Idempotency-Key'] = key
    try:
        async with asyncio.timeout(25):
            async with client().stream(method, url + path, headers=headers, json=body) as response:
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > 2_000_000:
                        raise HTTPException(502, 'Resposta do Hermes excedeu 2 MB.')
                if response.status_code >= 400:
                    # Do not expose arbitrary upstream error bodies or credentials.
                    raise HTTPException(response.status_code if response.status_code in {400,401,403,404,409,429,503} else 502, f'Hermes recusou a operação (HTTP {response.status_code}).')
                result = json.loads(chunks)
                if not isinstance(result, dict):
                    raise ValueError('Expected object')
                return result
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise HTTPException(504, 'O gateway demorou para responder; a execução pode continuar no Hermes.') from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, 'Resposta indisponível ou incompatível do gateway Hermes.') from exc


async def capabilities(force=False):
    url, headers = upstream()
    key = (url, hashlib.sha256(headers.get('Authorization', '').encode()).digest())
    cached = _capabilities.get(key)
    if cached and not force and time.monotonic() - cached[0] < 30:
        return cached[1]
    pending = _probes.setdefault(asyncio.get_running_loop(), {})
    task = pending.get(key)
    if task is None:
        task = asyncio.create_task(_probe_capabilities(key))
        pending[key] = task

        def finished(done):
            pending.pop(key, None)
            if not done.cancelled():
                done.exception()  # All HTTP callers may already have disconnected.

        task.add_done_callback(finished)
    # One disconnected client must not cancel the probe awaited by other tabs.
    return await asyncio.shield(task)


async def _probe_capabilities(key):
    try:
        async with asyncio.timeout(4):
            result = await request('GET', '/capabilities')
    except TimeoutError as exc:
        raise HTTPException(504, 'O Hermes não respondeu à verificação de conexão.') from exc
    features = result.get('features', {})
    if result.get('object') != 'hermes.api_server.capabilities' or result.get('platform') != 'hermes-agent' or not isinstance(features, dict):
        raise HTTPException(502, 'O endereço respondeu, mas não apresentou o contrato de capacidades do Hermes.')
    idem = features.get('runs_idempotency', {})
    result['atlas_compatible'] = all(features.get(f) is True for f in ('run_submission','run_status','run_events_sse','run_stop')) and isinstance(idem, dict) and idem.get('durable') is True
    now = time.monotonic()
    for expired, (created, _) in tuple(_capabilities.items()):
        if now - created >= 30:
            _capabilities.pop(expired, None)
    _capabilities[key] = (now, result)
    return result


async def events(remote_id, after=-1):
    url, headers = upstream()
    if after >= 0:
        headers['Last-Event-ID'] = str(after)
    async with client().stream('GET', url + '/runs/' + remote_id + '/events', headers=headers) as response:
        response.raise_for_status()
        data, event, size = [], '', 0
        async for line in response.aiter_lines():
            size += len(line)
            if size > 2_000_000:
                raise ValueError('Event too large')
            if not line:
                if data:
                    value = json.loads('\n'.join(data))
                    if isinstance(value, dict):
                        value.setdefault('type', event)
                        yield value
                data, event, size = [], '', 0
            elif line.startswith('data:'):
                data.append(line[5:].lstrip())
            elif line.startswith('event:'):
                event = line[6:].strip()
