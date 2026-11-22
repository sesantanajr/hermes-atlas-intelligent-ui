"""What `hermes plugins install` receives: a tree its install scan accepts, one version everywhere,
and a diagnostic that never changes the user's library."""
import hashlib
import json
import os
import re
import sqlite3
import subprocess
from contextlib import closing
from pathlib import Path

import pytest

from hermes_atlas import __version__, doctor
from hermes_atlas.runtime import database_path
from hermes_atlas.storage.store import Store

ROOT = Path(__file__).resolve().parents[1]

# hermes_cli/plugins_install_scan.py and tools/skills_guard.py: limits of the scan that runs on
# every clone, and the extensions it reports as binaries.
SCAN_MAX_FILES = 400
SCAN_MAX_BYTES = 10 * 1024 * 1024
SCAN_MAX_FILE_BYTES = 1024 * 1024
BINARY_EXTENSIONS = {".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".com", ".msi", ".dmg", ".app", ".deb", ".rpm"}
NOT_CLONED = {".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "work", "build"}


def cloned_files():
    """The files a clone of this repository contains (tracked plus new, ignored ones left out)."""
    try:
        listed = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT,
                                check=True, capture_output=True).stdout.decode("utf-8").split("\0")
        return [ROOT / name for name in listed if name and (ROOT / name).is_file()]
    except (OSError, subprocess.CalledProcessError):
        found = []
        for folder, directories, files in os.walk(ROOT):
            directories[:] = [name for name in directories if name not in NOT_CLONED]
            found += [Path(folder) / name for name in files]
        return found


def test_the_install_scan_accepts_the_tree():
    files = cloned_files()
    sizes = {path.relative_to(ROOT).as_posix(): path.stat().st_size for path in files}
    assert len(sizes) <= SCAN_MAX_FILES, f"{len(sizes)} files; Hermes scans at most {SCAN_MAX_FILES}"
    assert sum(sizes.values()) <= SCAN_MAX_BYTES, f"{sum(sizes.values())} bytes; the scan stops at 10 MB"
    large = {name: size for name, size in sizes.items() if size > SCAN_MAX_FILE_BYTES}
    assert not large, f"files over 1 MiB are reported by the scan: {large}"
    binaries = [name for name in sizes if Path(name).suffix.lower() in BINARY_EXTENSIONS]
    assert not binaries, f"the scan reports these as binaries: {binaries}"


def test_no_file_holds_text_the_install_scan_blocks_on():
    """Literals that Hermes's scan rates critical anywhere in the tree (a "dangerous" verdict blocks
    the install, even with --force), tests and docs included."""
    # Assembled from pieces so that this file does not itself contain what it looks for.
    leaves = ["/etc/" + "passwd", "/etc/" + "shadow", "/.hermes/" + ".env", "/." + "ssh"]
    critical = re.compile("|".join(re.escape(leaf) for leaf in leaves[:2])
                          + "|" + "|".join(r"(?:~|\$HOME)" + re.escape(leaf) for leaf in leaves[2:]))
    this_file = Path(__file__).resolve()
    found = []
    for path in cloned_files():
        if path.resolve() == this_file or path.suffix.lower() in {".png", ".jpg", ".webp", ".mp3", ".mp4"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        found += [f"{path.relative_to(ROOT).as_posix()}: {m.group(0)}" for m in critical.finditer(text)]
    assert not found, found


def test_the_built_interfaces_are_part_of_the_tree():
    names = {path.relative_to(ROOT).as_posix() for path in cloned_files()}
    for required in ("desktop/plugin.js", "dashboard/dist/index.js", "dashboard/dist/index.css",
                     "hermes_atlas/assets/viewer.html", "hermes_atlas/static/index.html", "hermes_atlas/catalog.json"):
        assert required in names, f"{required} must be committed: installing from Git runs no build"


def test_every_file_names_the_same_version():
    manifest = (ROOT / "plugin.yaml").read_text(encoding="utf-8")
    skill = (ROOT / "skills" / "canvas" / "SKILL.md").read_text(encoding="utf-8")
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    versions = {
        "hermes_atlas.__version__": __version__,
        "plugin.yaml": re.search(r'(?m)^version:\s*"?([^"\s]+)"?\s*$', manifest)[1],
        "package.json": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "dashboard/manifest.json": json.loads((ROOT / "dashboard" / "manifest.json").read_text(encoding="utf-8"))["version"],
        "skills/canvas/SKILL.md": re.search(r"(?m)^version:\s*(\S+)\s*$", skill)[1],
        "CHANGELOG.md": re.search(r"(?m)^## \[?(\d+\.\d+\.\d+)", changelog)[1],
    }
    assert set(versions.values()) == {__version__}, versions
    built = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
    assert f'"{__version__}"' in built, "desktop/plugin.js was built from another version: run npm run build"


def _fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mtime_ns


def test_doctor_does_not_create_a_library():
    results = {name: (status, detail) for status, name, detail in doctor.run()}
    assert results["library"][0] == doctor.OK and "not created yet" in results["library"][1]
    assert not database_path(create=False).exists()


def test_doctor_reads_an_existing_library_without_writing_to_it():
    store = Store()
    store.touch_client("desktop", {"version": "1.0.0"})
    path = database_path(create=False)
    before = _fingerprint(path)
    results = {name: (status, detail) for status, name, detail in doctor.run()}
    assert results["library"][0] == doctor.OK
    assert _fingerprint(path) == before


def test_doctor_leaves_an_older_library_for_atlas_to_upgrade():
    path = database_path(create=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("CREATE TABLE canvases (id TEXT, revision INTEGER, payload TEXT)")
        db.execute("INSERT INTO canvases VALUES ('old', 1, '{}')")
        db.execute("PRAGMA user_version = 1")
    before = _fingerprint(path)
    status, _, detail = next(result for result in doctor.run() if result[1] == "library")
    assert status == doctor.OK and "older format" in detail and "1 canvases" in detail
    assert _fingerprint(path) == before
    with closing(sqlite3.connect(path)) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1


@pytest.mark.parametrize("name", ["README.md", "README.en.md", "CHANGELOG.md", "after-install.md"])
def test_documents_link_only_to_files_that_exist(name):
    text = (ROOT / name).read_text(encoding="utf-8")
    for target in re.findall(r"\]\(((?!https?:|#|mailto:)[^)\s]+)\)", text):
        assert (ROOT / target.split("#")[0]).exists(), f"{name} links to missing {target}"
