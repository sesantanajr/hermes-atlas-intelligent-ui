"""Atlas Intelligent UI: validated, interactive canvases for Hermes Agent.

Layers, from the inside out:

``schema``   the canvas protocol (pydantic models for every block type)
``catalog``  searchable block catalogue with working examples
``storage``  SQLite library scoped to the Hermes profile
``render``   text and HTML renderings for surfaces without the Atlas UI
``agent``    tools, skill, slash command, CLI and hooks registered in Hermes
``server``   HTTP API for the dashboard tab, the Desktop extension and the standalone app

Importing this package has no side effects and pulls in nothing beyond the standard library.
"""

__version__ = "1.1.1"

# The plugin id Hermes knows Atlas by: plugin directory, config entry, data folder, API route,
# Desktop extension and skill namespace all use it.
PLUGIN_NAME = "atlas-intelligent-ui"
# Ids of earlier releases (1.0 was installed as ``hermes-atlas``). Their library and settings are
# carried over on first use, and leftovers of their install are reported by the doctor.
LEGACY_PLUGIN_NAMES = ("hermes-atlas",)
CANVAS_SCHEMA_VERSION = "1.0"
