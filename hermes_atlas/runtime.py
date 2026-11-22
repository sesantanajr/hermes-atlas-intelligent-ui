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

from . import LEGACY_PLUGIN_NAMES, PLUGIN_NAME

DEFAULT_GATEWAY = "http://127.0.0.1:8642"

# Set by ``hermes atlas serve``. Only that process may read the API server key from the profile's
# dotenv file: inside Hermes the key comes through the profile's secret scope instead.
_standalone = False


def mark_standalone() -> None:
    global _standalone
    _standalone = True


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
    try:
        return get_secret(name) or default
    except ImportError:
        # Hermes's packages are importable but not its top-level modules (a service running Hermes's
        # Python without its checkout on sys.path): not a Hermes process, so no secret scope applies.
        # Any other error, such as the refusal to read without a scope under multiplexing, propagates.
        return os.environ.get(name, default)


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


def api_server_key() -> str:
    """Bearer key for the Hermes API server: ``ATLAS_HERMES_API_KEY``, else Hermes's own
    ``API_SERVER_KEY``. The standalone app also looks in the profile's dotenv file, where Hermes
    keeps it, so a service needs no copy of the secret in its own environment."""
    key = setting("ATLAS_HERMES_API_KEY") or setting("API_SERVER_KEY")
    if key or not _standalone:
        return key
    return profile_dotenv_value("API_SERVER_KEY")


def profile_dotenv_value(name: str) -> str:
    """One value of the profile's dotenv file: ``NAME=value``, quoted or not, optionally ``export``-ed."""
    path = profile_home() / ".env"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return ""
    prefix = name + "="
    for line in lines:
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        if not line.startswith(prefix):
            continue
        value = line[len(prefix):].strip()
        if value[:1] in ("'", '"'):
            end = value.find(value[0], 1)
            return value[1:end] if end > 0 else value[1:]
        return value.split(" #", 1)[0].strip()
    return ""


def legacy_library(root: Path) -> Path | None:
    """The ``atlas.db`` that an install under an earlier plugin name left beside *root*, if any."""
    for name in LEGACY_PLUGIN_NAMES:
        candidate = root.parent / name / "atlas.db"
        if candidate.is_file():
            return candidate
    return None


def data_dir(create: bool = True) -> Path:
    """``<hermes home>/plugin-data/atlas-intelligent-ui`` (or ``ATLAS_DATA_DIR``), created on first use.

    The first call with ``create=True`` in a profile copies the library an earlier release left in
    ``plugin-data/hermes-atlas`` (see ``storage/migration.py``). ``create=False`` only computes the
    path and never writes: hooks that run on every turn and the doctor use it. Until that copy has
    happened it answers with the earlier folder, so they read the canvases the user actually has.
    """
    explicit = os.environ.get("ATLAS_DATA_DIR", "").strip()
    if explicit:
        root = Path(explicit).expanduser()
        if create:
            root.mkdir(parents=True, exist_ok=True)
        return root
    if not create:
        root = profile_home() / "plugin-data" / PLUGIN_NAME
        if not (root / "atlas.db").exists():
            earlier = legacy_library(root)
            if earlier is not None:
                return earlier.parent
        return root
    try:
        from plugins.plugin_storage import plugin_data_dir
        root = Path(plugin_data_dir(PLUGIN_NAME))
    except ImportError:
        root = profile_home() / "plugin-data" / PLUGIN_NAME
        root.mkdir(parents=True, exist_ok=True)
    from .storage.migration import adopt_legacy_library
    adopt_legacy_library(root)
    return root


def database_path(create: bool = True) -> Path:
    return data_dir(create) / "atlas.db"
