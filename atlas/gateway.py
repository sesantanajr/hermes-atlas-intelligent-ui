"""Public Hermes Runs API adapter. Credentials stay on the server."""
import asyncio
import json
import os
import time
from urllib.parse import urlsplit, quote
from pathlib import Path
from weakref import WeakKeyDictionary
import httpx
from fastapi import HTTPException

_clients = WeakKeyDictionary()
_capabilities = {}


def setting(name, default=''):
    try:
        from agent.secret_scope import get_secret
    except ImportError:
        return os.environ.get(name, default)
    return get_secret(name) or default


def profile_home():
    try:
        from hermes_constants import get_hermes_home
        return get_hermes_home()
    except ImportError:
        return Path(os.environ.get('HERMES_HOME', str(Path.home()/'.hermes')))


def gateway_url(home):
    prefix = '/p/' + quote(home.name, safe='') if home.parent.name == 'profiles' else ''
    return setting('ATLAS_HERMES_URL', 'http://127.0.0.1:8642' + prefix + '/v1').rstrip('/')


def upstream():
    url = gateway_url(profile_home())
    p = urlsplit(url)
    if p.scheme not in {'http', 'https'} or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise HTTPException(503, 'ATLAS_HERMES_URL inválida.')
    if p.scheme == 'http' and p.hostname not in {'localhost', '127.0.0.1', '::1'}:
        raise HTTPException(503, 'Use HTTPS ou um túnel local para o Hermes remoto.')
    key = setting('ATLAS_HERMES_API_KEY') or setting('API_SERVER_KEY')
    return url, {'Authorization': f'Bearer {key}'} if key else {}


def client():
    loop = asyncio.get_running_loop()
    if loop not in _clients or _clients[loop].is_closed:
        _clients[loop] = httpx.AsyncClient(timeout=httpx.Timeout(20, connect=5), limits=httpx.Limits(max_connections=20, max_keepalive_connections=10), follow_redirects=False)
    return _clients[loop]


async def close():
    c = _clients.pop(asyncio.get_running_loop(), None)
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
    key = (url, headers.get('Authorization'))
    cached = _capabilities.get(key)
    if cached and not force and time.monotonic() - cached[0] < 30:
        return cached[1]
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
    _capabilities[key] = (time.monotonic(), result)
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
