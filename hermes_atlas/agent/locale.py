"""Which language Atlas speaks to the user outside the UI (``/atlas``, ``hermes atlas``, exports)."""
import locale as _system_locale
import logging
import os

logger = logging.getLogger(__name__)


def _normalise(value):
    text = str(value or "").strip().lower().replace("_", "-")
    if text.startswith("pt"):
        return "pt"
    if text:
        return "en"
    return ""


def hermes_language():
    """``display.language`` from Hermes's config, when Atlas runs inside Hermes."""
    try:
        from hermes_cli.config import load_config_readonly
    except ImportError:
        return ""
    try:
        display = (load_config_readonly() or {}).get("display", {})
        return _normalise(display.get("language") if isinstance(display, dict) else "")
    except Exception as exc:
        logger.debug("Atlas could not read display.language: %s", exc)
        return ""


def resolve(setting="auto"):
    """``pt`` or ``en``: the explicit setting, else Hermes's display language, else the OS locale."""
    explicit = _normalise(setting) if setting and setting != "auto" else ""
    if explicit:
        return explicit
    found = hermes_language()
    if found:
        return found
    for name in ("LC_ALL", "LC_MESSAGES", "LANG"):
        found = _normalise(os.environ.get(name, "").split(".")[0])
        if found:
            return found
    try:
        return _normalise(_system_locale.getlocale()[0]) or "en"
    except (TypeError, ValueError):
        return "en"
