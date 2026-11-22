"""Carry the library of an install under an earlier plugin name over to the current one.

Atlas 1.0 was installed as ``hermes-atlas``; from 1.1 the plugin is ``atlas-intelligent-ui``.
Hermes keeps ``plugin-data/`` when a plugin is removed, so the first time 1.1 opens its library in
a profile it copies ``plugin-data/hermes-atlas/atlas.db`` into its own folder. The earlier folder
is never moved or deleted: MEDIA links in old conversations keep working and the copy can be
repeated by hand.

Gateway, dashboard and terminal can open the library at the same moment, so the copy runs under
an exclusive lock file and lands with one atomic rename.
"""
import json
import logging
import os
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .. import __version__
from ..runtime import legacy_library

logger = logging.getLogger(__name__)

MARKER = "migrated-from.json"
LOCK = ".migration.lock"
STALE_LOCK_SECONDS = 120
WAIT_SECONDS = 30


class MigrationBusy(RuntimeError):
    """Another process is still copying the earlier library."""


def adopt_legacy_library(root: Path) -> Path | None:
    """Copy the earlier ``atlas.db`` into *root* when *root* has none. Returns the copied file."""
    target = root / "atlas.db"
    if target.exists():
        return None
    source = legacy_library(root)
    if source is None:
        return None
    lock = root / LOCK
    if not _acquire(lock, target):
        return None
    try:
        if target.exists():
            return None
        return _copy(source, root, target)
    finally:
        try:
            lock.unlink()
        except OSError:
            pass


def _copy(source: Path, root: Path, target: Path) -> Path | None:
    partial = root / f"atlas.db.copying-{os.getpid()}"
    try:
        _upgrade_in_place(source)
        with closing(sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True, timeout=10)) as old, \
                closing(sqlite3.connect(partial)) as new:
            old.backup(new)
        os.replace(partial, target)
        from .store import keep_private
        keep_private(target)
    except (OSError, sqlite3.Error) as exc:
        # An unreadable earlier library must not keep Atlas from starting: start empty, say so
        # once in the marker (the doctor reports it) and leave the earlier folder untouched.
        logger.warning("Atlas could not copy its library from %s: %s", source, exc)
        _write_marker(root, source, error=f"{type(exc).__name__}: {exc}"[:300])
        return None
    finally:
        try:
            partial.unlink()
        except OSError:
            pass
    _write_marker(root, source)
    logger.info("Atlas copied its library from %s to %s", source, target)
    return source


def _upgrade_in_place(source: Path) -> None:
    """Before 0.3 the owner of a conversation was derived from the database path, so a database in
    that format is bound to its workspace where it is, as 1.0 would have done, before it moves."""
    with closing(sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True, timeout=10)) as db:
        version = db.execute("PRAGMA user_version").fetchone()[0]
    if version < 2:
        from .store import Store
        Store(path=source)


def _write_marker(root: Path, source: Path, error: str = "") -> None:
    record = {"from": str(source.parent), "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "by": __version__}
    if error:
        record["error"] = error
    try:
        (root / MARKER).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    except OSError as exc:
        logger.debug("Atlas could not write %s: %s", MARKER, exc)


def read_marker(root: Path) -> dict:
    try:
        return json.loads((root / MARKER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _acquire(lock: Path, target: Path) -> bool:
    """Take the lock; False when another process finished the copy while we waited."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
            return True
        except FileExistsError:
            pass
        if target.exists():
            return False
        try:
            if time.time() - lock.stat().st_mtime > STALE_LOCK_SECONDS:   # a copy that died midway
                lock.unlink()
                continue
        except OSError:
            continue
        if time.monotonic() > deadline:
            raise MigrationBusy(f"Atlas is still copying its library into {lock.parent}; try again in a moment")
        time.sleep(0.1)
