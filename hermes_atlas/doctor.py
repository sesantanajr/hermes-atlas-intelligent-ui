"""Self-check of an Atlas installation: ``hermes atlas doctor`` and ``python -m hermes_atlas doctor``.

``hermes plugins doctor atlas-intelligent-ui`` proves that Hermes can discover, import and
register the plugin. This check looks at what that one cannot see: that the shipped bundles are
present and belong to this version, that every catalogue example still validates, that the
library opens, and what an install under the earlier name (``hermes-atlas``) left behind.
Every check only reads: a diagnostic never creates, copies or migrates anything.
"""
import json
import re
from pathlib import Path

from . import LEGACY_PLUGIN_NAMES, PLUGIN_NAME, __version__

REPOSITORY = "sesantanajr/hermes-atlas-intelligent-ui"

OK, WARN, FAIL = "ok", "warn", "fail"
PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parent   # the plugin directory in a Hermes install, the checkout in development


def manifest_field(text, key):
    found = re.search(rf'(?m)^{re.escape(key)}:\s*["\']?([^"\'\n#]+?)["\']?\s*(?:#.*)?$', text)
    return found.group(1).strip() if found else ""


def manifest_list(text, key):
    """Items of a block-style YAML list (``key:`` followed by ``  - item`` lines)."""
    found = re.search(rf"(?m)^{re.escape(key)}:\s*\n((?:[ \t]+-[^\n]*\n?)+)", text)
    if not found:
        return []
    return [line.split("-", 1)[1].strip().strip("\"'") for line in found.group(1).splitlines() if "-" in line]


def _versions():
    found = {"hermes_atlas": __version__}
    manifest = ROOT / "plugin.yaml"
    if manifest.is_file():
        found["plugin.yaml"] = manifest_field(manifest.read_text(encoding="utf-8"), "version")
    for name in ("dashboard/manifest.json", "package.json"):
        path = ROOT / name
        if path.is_file():
            try:
                found[name] = str(json.loads(path.read_text(encoding="utf-8")).get("version", ""))
            except ValueError:
                found[name] = "unreadable"
    return found


def check_versions():
    found = _versions()
    different = {name: value for name, value in found.items() if value != __version__}
    if different:
        return FAIL, "versions", "; ".join(f"{name} says {value or 'nothing'}" for name, value in different.items()) + f" (package is {__version__})"
    return OK, "versions", f"{__version__} in " + ", ".join(found)


def check_files():
    if not (ROOT / "plugin.yaml").is_file():
        return OK, "plugin files", "not a plugin directory (installed as a Python package)"
    required = ["__init__.py", "dashboard/manifest.json", "dashboard/plugin_api.py", "dashboard/dist/index.js",
                "desktop/plugin.js", "skills/canvas/SKILL.md"]
    missing = [name for name in required if not (ROOT / name).is_file()]
    if missing:
        return FAIL, "plugin files", "missing " + ", ".join(missing)
    return OK, "plugin files", f"{len(required)} entry files present"


def check_assets():
    optional = {"static/index.html": "standalone app (hermes atlas serve)", "assets/viewer.html": "HTML export"}
    missing = [f"{what} [{name}]" for name, what in optional.items() if not (PACKAGE / name).is_file()]
    if missing:
        return WARN, "built assets", "not built: " + "; ".join(missing) + ". Run npm ci && npm run build."
    return OK, "built assets", "standalone app and HTML export available"


def check_manifest_tools():
    manifest = ROOT / "plugin.yaml"
    if not manifest.is_file():
        return OK, "declared tools", "no manifest beside the package"
    from .agent import tool_schemas
    declared = manifest_list(manifest.read_text(encoding="utf-8"), "provides_tools")
    if sorted(declared) != sorted(tool_schemas.NAMES):
        return FAIL, "declared tools", f"plugin.yaml lists {sorted(declared)} but the plugin registers {sorted(tool_schemas.NAMES)}"
    return OK, "declared tools", f"{len(declared)} tools declared and registered"


def check_catalog():
    from . import catalog
    try:
        from .agent import canvas_ops
        entries = catalog.entries()
        for item in entries:
            canvas_ops.validate({"id": "doctor", "title": item["label"], "blocks": [item["example"]]})
    except Exception as exc:
        return FAIL, "block catalogue", f"{type(exc).__name__}: {exc}"[:400]
    return OK, "block catalogue", f"{len(entries)} block types, every example validates"


def check_store():
    """Look at the library without changing it: a diagnostic must not create or migrate a database."""
    import sqlite3
    from contextlib import closing

    from .runtime import database_path
    path = database_path(create=False)
    if not path.is_file():
        return OK, "library", f"not created yet (first use creates {path})"
    copied = ""
    if path.parent.name in LEGACY_PLUGIN_NAMES:
        copied = f"; it is copied to plugin-data/{PLUGIN_NAME} the first time Atlas {__version__} opens it"
    try:
        with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True, timeout=5)) as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                return FAIL, "library", f"{path} failed SQLite's integrity check; restore it from a backup"
            tables = {name for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            table = "owned_canvases" if "owned_canvases" in tables else "canvases" if "canvases" in tables else None
            canvases = db.execute(f"SELECT COUNT(DISTINCT id) FROM {table}").fetchone()[0] if table else 0
    except sqlite3.Error as exc:
        return FAIL, "library", f"cannot read {path}: {exc}"[:400]
    note = "" if version >= 2 else " (older format; it is upgraded in place the next time Atlas opens it)"
    return OK, "library", f"{canvases} canvases in {path}{note}{copied}"


def legacy_findings():
    """What an install under an earlier plugin name left behind, as plain sentences (read-only)."""
    from .runtime import profile_home
    from .storage.migration import read_marker
    home = profile_home()
    findings = []
    here = ROOT.resolve()
    for name in LEGACY_PLUGIN_NAMES:
        earlier = home / "plugins" / name
        if earlier.is_dir() and earlier.resolve() != here:
            findings.append(f"the {name} install is still in {earlier}: run `hermes plugins remove {name}` "
                            "(both register the atlas tools, and the earlier one would win)")
    if (ROOT / "plugin.yaml").is_file() and ROOT.parent.name == "plugins" and ROOT.name != PLUGIN_NAME:
        findings.append(f"this copy sits in plugins/{ROOT.name}, so Hermes refuses its updates: run "
                        f"`hermes plugins remove {ROOT.name}` and `hermes plugins install {REPOSITORY}`")
    config = _config_view()
    plugins = config.get("plugins") if isinstance(config.get("plugins"), dict) else {}
    for list_name in ("enabled", "disabled"):
        names = plugins.get(list_name)
        stale = sorted(set(names) & set(LEGACY_PLUGIN_NAMES)) if isinstance(names, list) else []
        if stale and not (home / "plugins" / stale[0]).is_dir():
            findings.append(f"config.yaml still lists {', '.join(stale)} under plugins.{list_name}")
    bases = {home}
    if home.parent.name == "profiles":
        bases.add(home.parent.parent)
    for base in sorted(bases):
        for name in LEGACY_PLUGIN_NAMES:
            half = base / "desktop-plugins" / name
            if half.is_dir():
                findings.append(f"Hermes Desktop still has the {name} extension ({half}); after removing {name}, "
                                "use Capabilities > Plugins > Rescan in Desktop or restart it")
    from .runtime import data_dir
    marker = read_marker(data_dir(create=False))
    if marker.get("error"):
        findings.append(f"copying the library from {marker.get('from')} failed ({marker['error']}); "
                        "the earlier library is still there")
    return findings


def _config_view():
    try:
        from hermes_cli.config import load_config_readonly
        config = load_config_readonly() or {}
    except Exception:
        return {}
    return config if isinstance(config, dict) else {}


def check_legacy():
    findings = legacy_findings()
    if findings:
        return WARN, "earlier install", "; ".join(findings)
    return OK, "earlier install", f"nothing left from {', '.join(LEGACY_PLUGIN_NAMES)}"


def check_http_stack():
    missing = []
    for module in ("pydantic", "fastapi", "httpx", "uvicorn"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    if "pydantic" in missing:
        return FAIL, "python libraries", "pydantic is required (it ships with Hermes)"
    if missing:
        return WARN, "python libraries", "missing " + ", ".join(missing) + ": tools work, the dashboard API and standalone app do not"
    import pydantic
    if int(pydantic.VERSION.split(".")[0]) < 2:
        return FAIL, "python libraries", f"pydantic {pydantic.VERSION} is too old; Atlas needs 2.x"
    return OK, "python libraries", f"pydantic {pydantic.VERSION}, fastapi, httpx and uvicorn importable"


def check_reach():
    """1.1.2: what this Hermes offers that decides where canvases appear."""
    import importlib.util

    def has(module, attribute):
        try:
            spec = importlib.util.find_spec(module)
        except (ImportError, ValueError):
            return False
        if spec is None:
            return False
        try:
            return hasattr(importlib.import_module(module), attribute)
        except Exception:
            return False

    missing = []
    if not has("hermes_cli.plugin_rpc", "register_rpc"):
        missing.append("plugin RPC (Hermes Desktop and the Webapp reach Atlas only on the launch profile)")
    if not has("hermes_cli.plugin_session", "turn_client"):
        missing.append("turn client (chat apps on local sessions get a MEDIA file instead of the ::atlas line)")
    if missing:
        return WARN, "hermes reach", "this Hermes lacks " + "; ".join(missing)
    return OK, "hermes reach", "plugin RPC and turn client available: every profile, every chat app"


def check_toolset():
    """1.1.2: platforms whose explicit toolset list leaves out `atlas` (no canvas tools there)."""
    config = _config_view()
    agent = config.get("agent") if isinstance(config.get("agent"), dict) else {}
    disabled = agent.get("disabled_toolsets") if isinstance(agent.get("disabled_toolsets"), list) else []
    if "atlas" in disabled:
        return WARN, "toolset", "agent.disabled_toolsets turns the atlas toolset off everywhere"
    platforms = config.get("platform_toolsets") if isinstance(config.get("platform_toolsets"), dict) else {}
    without = sorted(name for name, tools in platforms.items() if isinstance(tools, list) and "atlas" not in tools)
    if without:
        return WARN, "toolset", ("atlas is missing from platform_toolsets." + ", platform_toolsets.".join(without) +
                                 ": run hermes tools enable atlas --platform <name> where you want canvases")
    return OK, "toolset", "atlas is offered on every platform with an explicit list" if platforms else "default toolsets"


def check_gateway():
    try:
        import asyncio

        from .server import gateway

        async def probe():
            try:
                return await gateway.capabilities(force=True)
            finally:
                await gateway.close()

        caps = asyncio.run(probe())
    except Exception as exc:
        detail = getattr(exc, "detail", None) or f"{type(exc).__name__}: {exc}"
        return WARN, "hermes gateway", f"{detail} (the Atlas chat needs the API server; canvases and tools do not)"[:400]
    if not caps.get("atlas_compatible"):
        return WARN, "hermes gateway", "reachable, but it does not offer durable runs; update Hermes to use the Atlas chat"
    return OK, "hermes gateway", f"connected, model {caps.get('model', 'hermes-agent')}"


def run(live=False):
    """``[(status, name, detail)]`` for every check; *live* also contacts the Hermes API server."""
    checks = [check_versions, check_files, check_assets, check_manifest_tools, check_http_stack, check_catalog,
              check_store, check_legacy, check_reach, check_toolset]
    if live:
        checks.append(check_gateway)
    results = []
    for check in checks:
        try:
            results.append(check())
        except Exception as exc:
            results.append((FAIL, check.__name__.removeprefix("check_"), f"{type(exc).__name__}: {exc}"[:400]))
    return results


def summary(results):
    return {"plugin": PLUGIN_NAME, "version": __version__,
            "ok": not any(status == FAIL for status, _, _ in results),
            "checks": [{"status": status, "name": name, "detail": detail} for status, name, detail in results]}
