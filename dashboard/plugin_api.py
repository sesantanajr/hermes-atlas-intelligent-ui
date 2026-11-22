"""Backend of the Atlas dashboard tab and of the Hermes Desktop extension.

Hermes imports this file by path as a top-level module (``hermes_dashboard_plugin_hermes-atlas``),
with no package around it and nothing added to ``sys.path``, then mounts ``router`` under
``/api/plugins/hermes-atlas/``. Under ``plugins.isolation: host`` the same happens inside the
profile's plugin host process.

The routes live in ``hermes_atlas/server/api.py``, which uses relative imports, so the sibling
package has to be loaded as a package first. If this process already imported it (the agent
half of the plugin, or a standalone install) that copy is reused; otherwise it is loaded under a
private name derived from its location, so two profiles with their own copy never share one.
"""
import hashlib
import importlib
import importlib.util
import sys
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parents[1] / "hermes_atlas"


def _loaded_package():
    """Name of an already imported copy of this very directory, if there is one."""
    target = _PACKAGE_DIR / "__init__.py"
    for name, module in list(sys.modules.items()):
        location = getattr(module, "__file__", None)
        if location and name.rpartition(".")[2] == "hermes_atlas":
            try:
                if Path(location).resolve() == target:
                    return name
            except OSError:
                continue
    return None


def _load_package():
    name = _loaded_package()
    if name:
        return name
    digest = hashlib.sha256(str(_PACKAGE_DIR).encode("utf-8")).hexdigest()[:12]
    name = f"_hermes_atlas_{digest}"
    spec = importlib.util.spec_from_file_location(
        name, _PACKAGE_DIR / "__init__.py", submodule_search_locations=[str(_PACKAGE_DIR)])
    if spec is None or spec.loader is None:
        raise ImportError(f"Atlas package not found at {_PACKAGE_DIR}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return name


router = importlib.import_module(_load_package() + ".server.api").router
