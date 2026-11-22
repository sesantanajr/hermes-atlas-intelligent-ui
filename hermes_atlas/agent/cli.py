"""``hermes atlas ...``: the library, exports, the standalone app and a self-check from a terminal.

Registered with ``ctx.register_cli_command``; the same parser serves ``python -m hermes_atlas``
when Atlas is installed on its own. Hermes skips CLI registration under ``plugins.isolation: host``,
where ``/atlas`` and the tools remain available.
"""
import argparse
import json
import sys
from pathlib import Path

from .. import __version__
from .locale import resolve as resolve_locale
from .messages import text

NAME = "atlas"
HELP = "Atlas canvases: library, export, standalone app and diagnostics"
DEFAULT_PORT = 7331
# The PluginContext of the running Hermes, bound by register(ctx); None for ``python -m hermes_atlas``.
_context = None


def bind(ctx):
    global _context
    _context = ctx


def setup(parser):
    """Build the argparse tree under ``hermes atlas``."""
    commands = parser.add_subparsers(dest="atlas_command", metavar="command")
    commands.add_parser("status", help="Library summary and recent canvases")
    listing = commands.add_parser("list", help="Search canvases by title")
    listing.add_argument("query", nargs="*", help="Text to look for in titles")
    show = commands.add_parser("show", help="Print a canvas as Markdown")
    show.add_argument("canvas", help="Canvas id, or part of its title")
    show.add_argument("--revision", type=int, help="Revision to read (default: latest)")
    show.add_argument("--plain", action="store_true", help="Lists instead of tables")
    export = commands.add_parser("export", help="Write a canvas to an HTML, Markdown or JSON file")
    export.add_argument("canvas", help="Canvas id, or part of its title")
    export.add_argument("--format", "-f", choices=["html", "markdown", "json"], default="html")
    export.add_argument("--revision", type=int)
    export.add_argument("--output", "-o", help="Copy the file to this path")
    serve = commands.add_parser("serve", help="Run the standalone Atlas app on this machine (loopback only)")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    doctor = commands.add_parser("doctor", help="Check this Atlas installation")
    doctor.add_argument("--live", action="store_true", help="Also contact the Hermes API server")
    doctor.add_argument("--json", action="store_true", help="Machine-readable report")
    commands.add_parser("migrate", help="Copy the library and settings of the earlier hermes-atlas install now")
    parser.set_defaults(func=handle)
    return parser


def _migrate(locale):
    """Do now what 1.1 otherwise does on first use, and say what is left of the earlier install."""
    from .. import doctor
    from ..runtime import data_dir
    from ..storage.migration import read_marker
    from ..storage.store import Store
    from .settings import carry_over
    store = Store()  # opening the library copies the earlier one when this profile has none yet
    folder = data_dir()
    marker = read_marker(folder)
    if marker.get("error"):
        print(text(locale, "migrate_failed", path=marker.get("from", ""), error=marker["error"]))
    elif marker:
        print(text(locale, "migrate_copied", path=marker.get("from", ""), canvases=store.stats()["canvases"]))
    else:
        print(text(locale, "migrate_nothing", path=folder))
    keys = carry_over(_context)
    print(text(locale, "migrate_settings", keys=", ".join(keys)) if keys else text(locale, "migrate_no_settings"))
    left = doctor.legacy_findings()
    for finding in left:
        print(f"  - {finding}")
    print(text(locale, "migrate_next") if left else text(locale, "migrate_done"))
    return 1 if marker.get("error") else 0


def _locale():
    from .settings import Settings
    return resolve_locale(Settings(_context).locale)


def _serve(port, locale):
    static = Path(__file__).resolve().parents[1] / "static"
    if not (static / "index.html").is_file():
        print(text(locale, "serve_missing"))
        return 1
    from ..server.app import serve
    print(text(locale, "serve", host="127.0.0.1", port=port))
    serve(port)
    return 0


def _doctor(args, locale):
    from .. import doctor
    results = doctor.run(live=args.live)
    report = doctor.summary(results)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["ok"] else 1
    print(text(locale, "doctor_title", version=__version__))
    marks = {doctor.OK: text(locale, "ok"), doctor.WARN: text(locale, "warn"), doctor.FAIL: text(locale, "fail")}
    for status, name, detail in results:
        print(f"  [{marks[status]}] {name}: {detail}")
    failures = sum(1 for status, _, _ in results if status == doctor.FAIL)
    print(text(locale, "doctor_bad", count=failures) if failures else text(locale, "doctor_ok"))
    return 1 if failures else 0


def _export(args, locale):
    import shutil

    from ..storage.store import Store
    from .commands import find_canvas
    from .tools import ToolError, write_export
    record = find_canvas(Store(), args.canvas, args.revision)
    if not record:
        print(text(locale, "not_found", query=args.canvas))
        return 1
    try:
        path = write_export(record, args.format, locale)
    except ToolError as exc:
        print(text(locale, "error", detail=str(exc)))
        return 1
    if args.output:
        target = Path(args.output).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        path = target
    print(text(locale, "exported", path=path))
    return 0


def dispatch(args):
    """Run the chosen sub-command and return a process exit code."""
    locale = _locale()
    command = getattr(args, "atlas_command", None) or "status"
    if command == "serve":
        return _serve(args.port, locale)
    if command == "doctor":
        return _doctor(args, locale)
    if command == "export":
        return _export(args, locale)
    if command == "migrate":
        return _migrate(locale)
    from . import commands
    if command == "list":
        print(commands.run("list " + " ".join(args.query), platform="cli", locale=locale))
    elif command == "show":
        revision = f" {args.revision}" if args.revision else ""
        print(commands.run(f"show {args.canvas}{revision}", platform="telegram" if args.plain else "cli", locale=locale))
    else:
        print(commands.run("status", platform="cli", locale=locale))
    return 0


def handle(args):
    """Entry point Hermes calls for ``hermes atlas``; a non-zero result ends the process with that code."""
    code = dispatch(args)
    if code:
        raise SystemExit(code)


def main(argv=None):
    """``python -m hermes_atlas`` and the ``atlas-intelligent-ui`` console script of the standalone wheel."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")  # canvas text is not always in the console's codepage
            except (OSError, ValueError):
                pass
    parser = setup(argparse.ArgumentParser(prog="atlas-intelligent-ui",
                                           description=f"Atlas Intelligent UI {__version__}. " + HELP))
    return dispatch(parser.parse_args(argv))
