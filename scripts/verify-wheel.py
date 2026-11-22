"""Install the optional standalone wheel in a fresh virtual environment, outside the checkout,
and check that it carries a working app: the command, the interface, the API and the export.

    python scripts/build_wheel.py && python scripts/verify-wheel.py work/wheels
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.search(r'__version__ = "([^"]+)"', (ROOT / "hermes_atlas" / "__init__.py").read_text(encoding="utf-8"))[1]
NAME = f"hermes_atlas_intelligent_ui-{VERSION}-py3-none-any.whl"

SMOKE = r'''
import json, sys
from pathlib import Path
import hermes_atlas
from fastapi.testclient import TestClient
from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.server.app import app

assert Path(hermes_atlas.__file__).is_relative_to(Path(sys.prefix)), hermes_atlas.__file__
base = "/api/plugins/hermes-atlas"
with TestClient(app, base_url="http://127.0.0.1") as client:
    page = client.get("/")
    assert page.status_code == 200 and "<html" in page.text, page.status_code
    assets = [name for name in __import__("re").findall(r'(?:src|href)="(/assets/[^"]+)"', page.text)]
    assert assets and all(client.get(name).status_code == 200 for name in assets), assets
    entries = client.get(base + "/components").json()
    assert len({entry["type"] for entry in entries}) == 73
    for entry in entries:
        example = client.get(base + "/components/" + entry["type"]).json()["example"]
        Canvas.model_validate({"id": "sample", "title": entry["label"], "blocks": [example]})
    saved = client.post(base + "/canvases", json={"id": "wheel-check", "title": "Wheel check",
                        "blocks": [{"type": "text", "id": "t", "title": "Text", "text": "Hello"}]}).json()
    exported = client.get(base + "/canvases/wheel-check/export?format=html").json()
    assert exported["content"].startswith("<!doctype html>") and "Wheel check" in exported["content"]
    assert client.get(base + "/status").json()["exports"]["html"] is True
print(json.dumps({"assets": len(assets), "blocks": len(entries), "export": True}))
'''


def main():
    wheel = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "work" / "wheels"
    if wheel.is_dir():
        wheel = wheel / NAME
    if wheel.name != NAME or not wheel.is_file():
        sys.exit(f"expected {NAME}; build it with scripts/build_wheel.py")
    with tempfile.TemporaryDirectory(prefix="atlas-wheel-") as directory:
        root = Path(directory)
        venv.create(root / "env", with_pip=True)
        bin_dir = root / "env" / ("Scripts" if sys.platform == "win32" else "bin")
        python = bin_dir / ("python.exe" if sys.platform == "win32" else "python")
        env = {**os.environ, "HERMES_HOME": str(root / "home"), "ATLAS_DATA_DIR": str(root / "data")}
        subprocess.run([str(python), "-m", "pip", "install", "--quiet", str(wheel), "httpx"], check=True, cwd=root)
        command = bin_dir / ("hermes-atlas.exe" if sys.platform == "win32" else "hermes-atlas")
        status = subprocess.run([str(command), "status"], check=True, cwd=root, env=env, capture_output=True, text=True)
        assert "Atlas" in status.stdout, status.stdout
        doctor = subprocess.run([str(command), "doctor", "--json"], cwd=root, env=env, capture_output=True, text=True)
        report = json.loads(doctor.stdout)
        smoke = subprocess.run([str(python), "-I", "-c", SMOKE], check=True, cwd=root, env=env,
                               capture_output=True, text=True)
        print(json.dumps({"wheel": wheel.name, "command": True, "doctor": report.get("ok"),
                          **json.loads(smoke.stdout.strip().splitlines()[-1])}))


if __name__ == "__main__":
    main()
