"""Repeatable local measurements of what Atlas costs Hermes. No model calls, credentials or user data.

    python scripts/benchmark.py --output docs/benchmark.json

- startup: time ``register(ctx)`` adds to a Hermes start, in a fresh interpreter, and which heavy
  libraries it imports (none should be: they load on the first tool call);
- tools: the size of the seven tool definitions sent with every model request;
- library: SQLite writes from four concurrent workers and reads, in a temporary directory;
- bundles: the files Hermes loads, against the 1 MiB per-file limit of its install scan.
"""
import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEAVY = ("pydantic", "fastapi", "httpx", "uvicorn", "starlette")

STARTUP = r"""
import json, sys, time
sys.path.insert(0, sys.argv[1])
if sys.argv[2] == "warm":
    # What a running Hermes process has already imported before it loads plugins.
    import argparse, copy, dataclasses, locale, logging, random, shutil, tempfile, textwrap, threading
    import traceback, unicodedata, urllib.parse, uuid
from hermes_host import LegacyHostContext, load_plugin
before = set(sys.modules)
started = time.perf_counter()
module = load_plugin()
ctx = LegacyHostContext()
module.register(ctx)
elapsed = (time.perf_counter() - started) * 1000
loaded = sorted({name.split(".")[0] for name in set(sys.modules) - before})
print(json.dumps({"ms": elapsed, "tools": len(ctx.tools), "loaded": loaded}))
"""


def startup(runs=7):
    """Median over fresh interpreters. ``warm`` has the standard library modules a Hermes process
    already holds, so it is Atlas's own share; ``cold`` also pays for those imports."""
    result = {}
    with tempfile.TemporaryDirectory(prefix="atlas-bench-home-") as home:
        env = {**os.environ, "HERMES_HOME": home, "ATLAS_DATA_DIR": str(Path(home) / "atlas")}
        for mode in ("warm", "cold"):
            samples, last = [], {}
            for _ in range(runs):
                out = subprocess.run([sys.executable, "-I", "-c", STARTUP, str(ROOT / "tests"), mode], cwd=ROOT,
                                     env=env, check=True, capture_output=True, text=True).stdout
                last = json.loads(out.strip().splitlines()[-1])
                samples.append(last["ms"])
            result[f"register_{mode}_median_ms"] = round(statistics.median(samples), 1)
            result["heavy_libraries_imported"] = sorted(set(result.get("heavy_libraries_imported", []))
                                                        | {name for name in last["loaded"] if name in HEAVY})
            result["tools_registered"] = last["tools"]
    result["runs"] = runs
    return result


def tools():
    sys.path.insert(0, str(ROOT))
    from hermes_atlas.agent import tool_schemas

    text = json.dumps(tool_schemas.ALL, ensure_ascii=False, separators=(",", ":"))
    return {"definitions": len(tool_schemas.ALL), "bytes": len(text.encode()),
            "approx_tokens": round(len(text) / 3.6)}


def library():
    from hermes_atlas.schema.canvas import Canvas
    from hermes_atlas.storage.store import Store

    with tempfile.TemporaryDirectory(prefix="atlas-bench-") as directory:
        store = Store(Path(directory) / "atlas.db")
        canvas = Canvas.model_validate({"id": "benchmark", "title": "Synthetic benchmark",
                                        "blocks": [{"type": "text", "id": "text", "title": "Text", "text": "Synthetic"}]})

        def write(_):
            started = time.perf_counter()
            record = store.save(canvas)
            return record["revision"], (time.perf_counter() - started) * 1000

        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=4) as pool:
            samples = list(pool.map(write, range(100)))
        wall = time.perf_counter() - started
        assert len({revision for revision, _ in samples}) == 100, "lost or duplicated revisions"
        writes = sorted(value for _, value in samples)
        reads = []
        for _ in range(100):
            started = time.perf_counter()
            assert store.get("benchmark")["revision"] == 100
            reads.append((time.perf_counter() - started) * 1000)
    return {"writes": 100, "workers": 4, "unique_revisions": 100, "seconds": round(wall, 3),
            "write_median_ms": round(statistics.median(writes), 2), "write_p95_ms": round(writes[94], 2),
            "read_median_ms": round(statistics.median(reads), 3)}


def bundles():
    names = ["dashboard/dist/index.js", "dashboard/dist/index.css", "desktop/plugin.js", "hermes_atlas/assets/viewer.html"]
    sizes = {name: (ROOT / name).stat().st_size for name in names if (ROOT / name).is_file()}
    return {"bytes": sizes, "largest_vs_scan_limit": round(max(sizes.values()) / (1024 * 1024), 2) if sizes else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = {
        "environment": {"python": platform.python_version(), "os": platform.system(),
                        "scope": "local synthetic measurements, not a model or provider comparison"},
        "startup": startup(),
        "tools": tools(),
        "library": library(),
        "bundles": bundles(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
