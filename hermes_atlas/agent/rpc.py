"""The Atlas HTTP API over Hermes's plugin JSON-RPC (``plugin.atlas-intelligent-ui.http``).

Hermes Desktop and the Webapp reach a plugin's ``plugin_api.py`` through ``ctx.rest``, which the
dashboard serves from the copy installed in the profile Hermes was launched with. Since Hermes 0.23
that router refuses requests scoped to any other profile for a plugin that is not bundled (PLG-3),
so on a secondary profile (Atlas IA, Atlas Code ...) every Atlas call answered 404 and the inline
canvas never loaded. Plugin RPC methods (``ctx.register_rpc``) are served by the gateway's session
authority in the profile that owns them: the extension calls this method first and falls back to
``ctx.rest`` on Hermes releases without it.

The method replays one request against the same FastAPI router the dashboard mounts, in this
process and this profile, so validation, errors and storage are exactly those of the REST API.
Only the router's own paths are accepted; nothing here reaches the network.
"""
import asyncio
import json
import logging
import re
import threading
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

NAME = "http"
METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})
_SEGMENT = r"[A-Za-z0-9_-]{1,64}"
_RUN = r"[0-9a-fA-F-]{36}"
# Every route of ``hermes_atlas/server/api.py``, and nothing else.
PATHS = re.compile(
    r"^/(?:status|components(?:/[a-z_]{1,64})?|clients/(?:desktop|dashboard|standalone)|workspace"
    rf"|canvases(?:/{_SEGMENT}(?:/(?:versions|draft|text|export))?)?"
    rf"|conversations(?:/{_SEGMENT})?|runs(?:/{_RUN}(?:/(?:stop|approval|clarify|resolve-unknown))?)?|chat)$"
)
MAX_BODY = 600_000          # characters of JSON; the API refuses larger runs and canvases anyway


class RpcRefused(ValueError):
    """A request this bridge does not forward (not an API path, wrong shape)."""


def _query(value):
    if value in (None, "", {}):
        return ""
    if isinstance(value, str):
        return value.lstrip("?")
    if isinstance(value, dict):
        pairs = [(str(k), "true" if v is True else "false" if v is False else str(v))
                 for k, v in value.items() if v is not None and isinstance(v, (str, int, float, bool))]
        return urlencode(pairs)
    raise RpcRefused("`query` must be an object or a string.")


def parse(params):
    """``(method, path, query, body, scope)`` from the RPC params, or RpcRefused."""
    if not isinstance(params, dict):
        raise RpcRefused("Parameters must be an object.")
    method = str(params.get("method") or "GET").upper()
    if method not in METHODS:
        raise RpcRefused(f"Unsupported method {method}.")
    raw = params.get("path")
    if not isinstance(raw, str) or len(raw) > 400:
        raise RpcRefused("`path` must be an API path such as /canvases.")
    path, _, inline_query = raw.partition("?")
    if not PATHS.match(path):
        raise RpcRefused(f"Not an Atlas API path: {path[:80]}")
    query = "&".join(part for part in (inline_query, _query(params.get("query"))) if part)
    body = params.get("body")
    encoded = None
    if body is not None:
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        if len(encoded) > MAX_BODY:
            raise RpcRefused("The request body is too large.")
    scope = params.get("scope")
    if scope is not None and (not isinstance(scope, str) or not re.fullmatch(r"[0-9a-f]{1,128}", scope)):
        raise RpcRefused("`scope` must be the workspace id the API returned.")
    return method, path, query, encoded, scope


def _run(coroutine):
    """Run *coroutine* to completion from synchronous code, on a fresh loop. Hermes calls RPC
    handlers off its event loop; if one ever arrives on a thread with a running loop, a helper
    thread keeps that loop free (the context, and so the profile scope, is carried over)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coroutine)
    import contextvars

    result, context = {}, contextvars.copy_context()

    def worker():
        try:
            result["value"] = context.run(asyncio.run, coroutine)
        except BaseException as exc:  # re-raised in the caller's thread
            result["error"] = exc

    thread = threading.Thread(target=worker, name="atlas-rpc", daemon=True)
    thread.start()
    thread.join(90)
    if "error" in result:
        raise result["error"]
    if "value" not in result:
        raise TimeoutError("The Atlas API did not answer in time.")
    return result["value"]


def http(params, *, session_id=None, **kwargs):
    """``plugin.atlas-intelligent-ui.http``: ``{method, path, query?, body?, scope?}`` ->
    ``{status, body}`` (the decoded JSON of the API's answer; errors keep their status and detail)."""
    try:
        method, path, query, body, scope = parse(params)
    except RpcRefused as refusal:
        return {"status": 400, "body": {"detail": str(refusal)}}
    try:
        from ..server.rpc import dispatch  # the HTTP stack, on the first call only

        return _run(dispatch(method, path, query, body, scope))
    except Exception as exc:  # the caller gets an answer it can show, never a gateway error
        logger.warning("Atlas RPC %s %s failed: %s", method, path, exc)
        return {"status": 500, "body": {"detail": f"Atlas internal error ({type(exc).__name__})."}}


def register(ctx):
    """Serve the bridge when this Hermes has plugin RPC (0.23+); report whether it did."""
    register_rpc = getattr(ctx, "register_rpc", None)
    if not callable(register_rpc):
        return False
    try:
        register_rpc(NAME, http)
        return True
    except Exception as exc:
        logger.warning("Atlas could not register its RPC bridge: %s", exc)
        return False
