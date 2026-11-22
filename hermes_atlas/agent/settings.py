"""Plugin settings, declared in ``plugin.yaml`` (``config_schema``) and edited with
``hermes plugins config atlas-intelligent-ui`` or the Desktop settings form.

Inside ``register(ctx)`` code they are read through ``ctx.get_config``; the dashboard API has no
``ctx`` and reads the same keys from ``plugins.entries.atlas-intelligent-ui.settings`` in
``config.yaml``. A key that is not set there falls back to the entry of the earlier plugin name
(``hermes-atlas``), and the agent side copies it over once so it survives
``hermes plugins remove hermes-atlas``. Every reader falls back to the defaults below, so a
missing or malformed value never breaks a tool.
"""
import logging

from .. import LEGACY_PLUGIN_NAMES, PLUGIN_NAME

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
_UNSET = object()
# Settings already copied from the earlier plugin name in this process (copied at most once).
_carried = set()


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
        if not callable(reader):
            return _from_config_file(key)
        try:
            value = reader(key, _UNSET)
        except Exception as exc:  # a broken config file must not take the tools down
            logger.debug("Atlas could not read setting %s: %s", key, exc)
            return DEFAULTS[key]
        if value is not _UNSET:
            return value
        value = _legacy_value(_read_config(), key)
        if value is _UNSET:
            return DEFAULTS[key]
        self._carry_over(key, value)
        return value

    def _carry_over(self, key, value):
        """Write a value found under the earlier plugin name under the current one, once."""
        if key in _carried:
            return
        _carried.add(key)
        writer = getattr(self._ctx, "set_config", None)
        if not callable(writer):
            return
        try:
            writer(key, value)
        except Exception as exc:  # read-only config, isolation host without write access...
            logger.debug("Atlas could not copy setting %s from %s: %s", key, LEGACY_PLUGIN_NAMES[0], exc)

    def get(self, key):
        return _coerce(key, self._raw(key))

    def __getattr__(self, key):
        if key in DEFAULTS:
            return self.get(key)
        raise AttributeError(key)


def _read_config():
    """Hermes's read-only view of ``config.yaml``, or None outside Hermes or when it is unreadable."""
    try:
        from hermes_cli.config import load_config_readonly
    except ImportError:
        return None
    try:
        config = load_config_readonly() or {}
    except Exception as exc:
        logger.debug("Atlas could not read config.yaml: %s", exc)
        return None
    return config if isinstance(config, dict) else None


def entry_settings(config, name):
    """``plugins.entries.<name>.settings`` as a dict (empty when absent or malformed)."""
    plugins = config.get("plugins") if isinstance(config, dict) else None
    entries = plugins.get("entries") if isinstance(plugins, dict) else None
    entry = entries.get(name) if isinstance(entries, dict) else None
    settings = entry.get("settings") if isinstance(entry, dict) else None
    return settings if isinstance(settings, dict) else {}


def _legacy_value(config, key):
    if not config:
        return _UNSET
    for name in LEGACY_PLUGIN_NAMES:
        settings = entry_settings(config, name)
        if key in settings:
            return settings[key]
    return _UNSET


def carry_over(ctx):
    """Copy every setting that only the earlier entry has into the current one (``hermes atlas
    migrate``). Returns the keys written; nothing happens without ``ctx.set_config``."""
    writer = getattr(ctx, "set_config", None)
    config = _read_config()
    if not callable(writer) or not config:
        return []
    current = entry_settings(config, PLUGIN_NAME)
    written = []
    for key in DEFAULTS:
        value = _UNSET if key in current else _legacy_value(config, key)
        if value is _UNSET:
            continue
        try:
            writer(key, value)
        except Exception as exc:
            logger.debug("Atlas could not copy setting %s: %s", key, exc)
            continue
        _carried.add(key)
        written.append(key)
    return written


def _from_config_file(key):
    """The same value for code without ``ctx`` (dashboard routes): Hermes's read-only config view."""
    config = _read_config()
    if config is None:
        return DEFAULTS[key]
    current = entry_settings(config, PLUGIN_NAME)
    if key in current:
        return current[key]
    value = _legacy_value(config, key)
    return DEFAULTS[key] if value is _UNSET else value
