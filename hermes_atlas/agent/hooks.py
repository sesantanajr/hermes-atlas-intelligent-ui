"""Lifecycle hooks.

``pre_llm_call`` closes the loop between a canvas and the conversation that made it: when the
user ticks, edits or saves a canvas the agent created, the next turn of that conversation
carries one short note saying so. The note is appended to the user message for that turn only
(Hermes never persists it) and each change is announced once.

Hook callbacks receive keyword arguments and must accept ``**kwargs``: Hermes adds fields over time.
"""
import logging

from ..runtime import database_path

logger = logging.getLogger(__name__)


def _describe(change):
    if change["kind"] == "revision":
        detail = f"the user saved revision {change['revision']} (you last wrote revision {change['agent_revision']})"
    else:
        detail = "the user has unsaved changes (ticks, answers, selections or edits)"
    return f'- "{change["title"]}" (id {change["id"]}): {detail}'


def user_changes_note(changes):
    lines = "\n".join(_describe(change) for change in changes)
    return ("[Atlas] The user changed canvases you created in this conversation:\n" + lines +
            "\nRead the current content with atlas_get before you refer to it or update it.")


def make_pre_llm_call(settings):
    def atlas_pre_llm_call(session_id="", **kwargs):
        try:
            if not settings.context_hints:
                return None
            sessions = [value for value in (session_id, kwargs.get("conversation_id"), kwargs.get("parent_session_id"))
                        if isinstance(value, str) and value]
            if not sessions:
                return None
            database = database_path(create=False)
            if not database.is_file():
                return None  # Atlas has never been used in this profile: stay out of the way
            from ..storage.store import Store
            changes = Store().user_changes(sessions)
            return {"context": user_changes_note(changes)} if changes else None
        except Exception as exc:  # a hook must never disturb the turn
            logger.debug("Atlas pre_llm_call skipped: %s", exc)
            return None
    return atlas_pre_llm_call
