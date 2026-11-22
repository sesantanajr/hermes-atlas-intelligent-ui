"""Tell open Hermes Desktop windows that something changed in Atlas.

Hermes lets plugin code push an event to every Desktop window connected to the current process
(``hermes_cli.plugin_events.broadcast_plugin_event``); the Atlas extension listens for
``plugin.atlas-intelligent-ui.<event>`` and refreshes the canvases it is showing. Agent tools also
send the event to the viewers of their own session (``ctx.emit_to_session``), which is the path
that works under ``plugins.isolation: host``. Front ends refresh on their own as well, so a missed
event only delays a refresh.
"""
import logging
import os
import sys

from . import PLUGIN_NAME

logger = logging.getLogger(__name__)

CANVAS_SAVED = "canvas.saved"
CANVAS_DELETED = "canvas.deleted"
# Hermes sets this in the isolated plugin host, which forwards only session events.
_HOST_PROCESS_ENV = "HERMES_PLUGIN_HOST_PROCESS"


def broadcast(event, payload=None):
    """Push ``plugin.atlas-intelligent-ui.<event>`` to the Desktop windows of this process, best effort.

    Only a process that already runs Hermes's TUI gateway server has such windows. Anywhere else
    (the plugin host, a terminal command, the standalone app) importing that server would start
    its machinery to find nobody listening, so this returns False without trying; Hermes core
    checks the same way. True means Hermes accepted the event, not that a window received it.
    """
    if os.environ.get(_HOST_PROCESS_ENV) == "1" or "tui_gateway.server" not in sys.modules:
        return False
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
    except ImportError:
        return False
    try:
        broadcast_plugin_event(PLUGIN_NAME, event, payload or {})
        return True
    except Exception as exc:  # never let a notification break the save that caused it
        logger.debug("Atlas could not broadcast %s: %s", event, exc)
        return False


def canvas_payload(record, origin=""):
    payload = {"id": record["id"], "revision": record["revision"], "title": record["canvas"].get("title", "")}
    if origin:
        payload["origin"] = origin
    return payload


def canvas_saved(record, origin):
    """*origin* is ``"agent"`` or ``"user"``."""
    return broadcast(CANVAS_SAVED, canvas_payload(record, origin))
