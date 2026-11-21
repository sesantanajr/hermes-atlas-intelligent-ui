"""Load sibling runtime without modifying global import paths."""
import importlib.util
import sys
from pathlib import Path

package = "_hermes_atlas_runtime"
if package not in sys.modules:
    root = Path(__file__).resolve().parents[1] / "atlas"
    spec = importlib.util.spec_from_file_location(package, root / "__init__.py", submodule_search_locations=[str(root)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[package] = module
    spec.loader.exec_module(module)
from importlib import import_module
router = import_module(package + ".api").router
