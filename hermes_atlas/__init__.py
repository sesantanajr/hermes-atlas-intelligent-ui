"""Hermes Atlas: validated, interactive canvases for Hermes Agent.

Layers, from the inside out:

``schema``   the canvas protocol (pydantic models for every block type)
``catalog``  searchable block catalogue with working examples
``storage``  SQLite library scoped to the Hermes profile
``render``   text and HTML renderings for surfaces without the Atlas UI
``agent``    tools, skill, slash command, CLI and hooks registered in Hermes
``server``   HTTP API for the dashboard tab, the Desktop extension and the standalone app

Importing this package has no side effects and pulls in nothing beyond the standard library.
"""

__version__ = "1.0.0"

PLUGIN_NAME = "hermes-atlas"
CANVAS_SCHEMA_VERSION = "1.0"
