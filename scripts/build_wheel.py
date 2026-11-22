"""Build the optional standalone wheel into ``work/wheels``.

The repository root is a Hermes plugin and must not carry a ``[project]`` table (see the note in
``pyproject.toml``), so the wheel is built from a staged copy: ``hermes_atlas/`` plus the metadata
in ``packaging/pyproject.toml``. Run ``npm run build`` first so the app and viewer are present.

    python scripts/build_wheel.py [--out work/wheels]
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ("hermes_atlas/static/index.html", "hermes_atlas/assets/viewer.html", "hermes_atlas/catalog.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=ROOT / "work" / "wheels")
    args = parser.parse_args()
    missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
    if missing:
        sys.exit("Build the interface first (npm ci && npm run build). Missing: " + ", ".join(missing))
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="atlas-wheel-") as staging:
        stage = Path(staging)
        shutil.copytree(ROOT / "hermes_atlas", stage / "hermes_atlas",
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for name in ("README.md", "LICENSE"):
            shutil.copy2(ROOT / name, stage / name)
        shutil.copy2(ROOT / "packaging" / "pyproject.toml", stage / "pyproject.toml")
        subprocess.run([sys.executable, "-m", "pip", "wheel", "--no-deps", "--wheel-dir", str(out), str(stage)], check=True)
    wheels = sorted(out.glob("hermes_atlas_intelligent_ui-*.whl"))
    print("built", wheels[-1] if wheels else "nothing")


if __name__ == "__main__":
    main()
