"""Tell open Hermes Desktop windows that something changed in Atlas.

Newer Hermes releases let plugin code push an event to every connected Desktop window
(``hermes_cli.plugin_events.broadcast_plugin_event``); the Atlas extension listens for
``plugin.hermes-atlas.<event>`` and refreshes the canvases it is showing. On releases without
that API, and outside Hermes, this is a no-op: the front ends also refresh on their own.
"""
import logging

from . import PLUGIN_NAME

logger = logging.getLogger(__name__)

CANVAS_SAVED = "canvas.saved"
CANVAS_DELETED = "canvas.deleted"


def broadcast(event, payload=None):
    """Push ``plugin.hermes-atlas.<event>`` to connected Desktop windows. Returns whether Hermes took it."""
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


def canvas_saved(record, origin):
    """*origin* is ``"agent"`` or ``"user"``."""
    return broadcast(CANVAS_SAVED, {"id": record["id"], "revision": record["revision"],
                                    "title": record["canvas"].get("title", ""), "origin": origin})
