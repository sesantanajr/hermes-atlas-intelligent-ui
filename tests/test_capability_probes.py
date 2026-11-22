import asyncio
from contextvars import ContextVar
import pytest
from fastapi import HTTPException
from hermes_atlas.server import gateway


def test_concurrent_status_probes_share_requests_and_survive_client_cancellation(monkeypatch):
    async def scenario():
        credential = ContextVar('credential', default='profile-a')
        started, release = asyncio.Event(), asyncio.Event()
        calls = []

        async def request(*args):
            calls.append(credential.get())
            started.set()
            await release.wait()
            return {'platform': 'hermes-agent', 'object': 'hermes.api_server.capabilities',
                    'model': credential.get(), 'features': {}}

        monkeypatch.setattr(gateway, 'upstream', lambda: ('local-test', {'Authorization': credential.get()}))
        monkeypatch.setattr(gateway, 'request', request)
        gateway._capabilities.clear()
        first = asyncio.create_task(gateway.capabilities())
        await started.wait()
        peers = [asyncio.create_task(gateway.capabilities()) for _ in range(15)]
        credential.set('profile-b')
        other = asyncio.create_task(gateway.capabilities())
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        release.set()
        assert all(result['model'] == 'profile-a' for result in await asyncio.gather(*peers))
        assert (await other)['model'] == 'profile-b'
        assert (await gateway.capabilities())['model'] == 'profile-b'
        assert calls.count('profile-a') == calls.count('profile-b') == 1
        await gateway.close()

    asyncio.run(scenario())


def test_failed_probe_does_not_block_immediate_recovery(monkeypatch):
    async def scenario():
        calls = 0
        async def request(*args):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise HTTPException(503, 'offline')
            return {'platform': 'hermes-agent', 'object': 'hermes.api_server.capabilities', 'features': {}}
        monkeypatch.setattr(gateway, 'upstream', lambda: ('recovery-test', {}))
        monkeypatch.setattr(gateway, 'request', request)
        failures = await asyncio.gather(*(gateway.capabilities() for _ in range(4)), return_exceptions=True)
        assert all(isinstance(f, HTTPException) for f in failures) and calls == 1
        assert (await gateway.capabilities())['platform'] == 'hermes-agent' and calls == 2
        await gateway.close()
    asyncio.run(scenario())
