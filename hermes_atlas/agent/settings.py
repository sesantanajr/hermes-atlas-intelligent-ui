"""Plugin settings, declared in ``plugin.yaml`` (``config_schema``) and edited with
``hermes plugins config hermes-atlas`` or the Desktop settings form.

Inside ``register(ctx)`` code they are read through ``ctx.get_config``; the dashboard API has no
``ctx`` and reads the same keys from ``plugins.entries.hermes-atlas.settings`` in ``config.yaml``.
Every reader falls back to the defaults below, so a missing or malformed value never breaks a tool.
"""
import logging

from .. import PLUGIN_NAME

logger = logging.getLogger(__name__)

DEFAULTS = {
    # How tools tell the model to present a canvas: auto | file | directive | text (see surfaces.py).
    "reply_style": "auto",
    # Tell the agent, once, when the user changed a canvas it created.
    "context_hints": True,
    # Offer the read-only host metrics tool (disk, memory, load).
    "resources_tool": True,
    # Language of /atlas and `hermes atlas` output: auto | pt-BR | en.
    "locale": "auto",
}
_CHOICES = {"reply_style": {"auto", "file", "directive", "text"}, "locale": {"auto", "pt-BR", "en"}}


def _coerce(key, value):
    default = DEFAULTS[key]
    if isinstance(default, bool):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
            return value.strip().lower() in {"true", "1", "yes", "on"}
        return default
    if key in _CHOICES:
        return value if value in _CHOICES[key] else default
    return value if isinstance(value, type(default)) else default


class Settings:
    """Reads a setting on every access, so a change in the settings form applies without a restart."""

    def __init__(self, ctx=None):
        self._ctx = ctx

    def _raw(self, key):
        reader = getattr(self._ctx, "get_config", None)
        if callable(reader):
            try:
                return reader(key, DEFAULTS[key])
            except Exception as exc:  # a broken config file must not take the tools down
                logger.debug("Atlas could not read setting %s: %s", key, exc)
                return DEFAULTS[key]
        return _from_config_file(key)

    def get(self, key):
        return _coerce(key, self._raw(key))

    def __getattr__(self, key):
        if key in DEFAULTS:
            return self.get(key)
        raise AttributeError(key)


def _from_config_file(key):
    """The same value for code without ``ctx`` (dashboard routes): Hermes's read-only config view."""
    try:
        from hermes_cli.config import load_config_readonly
    except ImportError:
        return DEFAULTS[key]
    try:
        config = load_config_readonly() or {}
        entry = config.get("plugins", {}).get("entries", {}).get(PLUGIN_NAME, {})
        return entry.get("settings", {}).get(key, DEFAULTS[key])
    except Exception as exc:
        logger.debug("Atlas could not read config.yaml: %s", exc)
        return DEFAULTS[key]
