"""Where Atlas is running: profile home, data directory and settings.

Standard library only, so the agent side of the plugin can import it without pulling the HTTP
stack. Hermes modules are imported lazily and only through names listed in Hermes's public
plugin API (``hermes_constants``, ``agent.secret_scope``, ``plugins.plugin_storage``); every
lookup falls back to plain environment variables so the same code serves the standalone app.
"""
import os
import sys
from pathlib import Path
from urllib.parse import quote

from . import PLUGIN_NAME

DEFAULT_GATEWAY = "http://127.0.0.1:8642"


def inside_hermes() -> bool:
    """Whether this process can reach Hermes's own modules (plugin, dashboard or plugin host)."""
    try:
        import hermes_constants  # noqa: F401
    except ImportError:
        return False
    return True


def setting(name: str, default: str = "") -> str:
    """A secret or environment setting, read through the profile's secret scope inside Hermes."""
    try:
        from agent.secret_scope import get_secret
    except ImportError:
        return os.environ.get(name, default)
    return get_secret(name) or default


def profile_home() -> Path:
    """The active Hermes profile directory. Resolved on every call: one process serves many profiles."""
    try:
        from hermes_constants import get_hermes_home
        return Path(get_hermes_home())
    except ImportError:
        pass
    explicit = os.environ.get("HERMES_HOME", "").strip()
    if explicit:
        return Path(os.path.expanduser(os.path.expandvars(explicit)))
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA", "").strip()
        return (Path(local) if local else Path.home() / "AppData" / "Local") / "hermes"
    return Path.home() / ".hermes"


def profile_name(home: Path | None = None) -> str:
    home = home or profile_home()
    return home.name if home.parent.name == "profiles" else "default"


def gateway_url(home: Path | None = None) -> str:
    """Base URL of the Hermes API server for this profile (``.../v1``, no trailing slash)."""
    home = home or profile_home()
    prefix = "/p/" + quote(home.name, safe="") if home.parent.name == "profiles" else ""
    return setting("ATLAS_HERMES_URL", DEFAULT_GATEWAY + prefix + "/v1").rstrip("/")


def data_dir(create: bool = True) -> Path:
    """``<hermes home>/plugin-data/hermes-atlas`` (or ``ATLAS_DATA_DIR``), created on first use.

    ``create=False`` only computes the path: hooks that run on every turn use it to stay out of
    the file system for people who have never opened Atlas.
    """
    explicit = os.environ.get("ATLAS_DATA_DIR", "").strip()
    if explicit:
        root = Path(explicit).expanduser()
    elif create:
        try:
            from plugins.plugin_storage import plugin_data_dir
            return Path(plugin_data_dir(PLUGIN_NAME))
        except ImportError:
            root = profile_home() / "plugin-data" / PLUGIN_NAME
    else:
        root = profile_home() / "plugin-data" / PLUGIN_NAME
    if create:
        root.mkdir(parents=True, exist_ok=True)
    return root


def database_path(create: bool = True) -> Path:
    return data_dir(create) / "atlas.db"
