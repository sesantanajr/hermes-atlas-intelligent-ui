"""Replay one Atlas API request in this process (the plugin RPC bridge, ``agent/rpc.py``).

The FastAPI app and httpx are imported on the first call only: the agent side registers the
bridge without loading the HTTP stack, as it does for everything else.
"""
import threading

_app = None
_app_lock = threading.Lock()


def application():
    """A FastAPI app with the Atlas router, built once."""
    global _app
    with _app_lock:
        if _app is None:
            from fastapi import FastAPI
            from .api import router
            app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
            app.include_router(router)
            _app = app
        return _app


async def dispatch(method, path, query, body, scope):
    """``{status, body}`` for one request against the router, through ASGI (no socket)."""
    import httpx

    headers = {"content-type": "application/json"} if body is not None else {}
    if scope:
        headers["x-atlas-workspace"] = scope
    transport = httpx.ASGITransport(app=application())
    async with httpx.AsyncClient(transport=transport, base_url="http://atlas.rpc") as client:
        response = await client.request(method, path + ("?" + query if query else ""), content=body,
                                        headers=headers, timeout=60)
    try:
        payload = response.json() if response.content else None
    except ValueError:
        payload = {"detail": response.text[:2000]}
    return {"status": response.status_code, "body": payload}
