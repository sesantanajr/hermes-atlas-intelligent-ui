"""Atlas Intelligent UI: plugin entry point.

Hermes installs the plugin as ``plugins/atlas-intelligent-ui``, imports this file as
``hermes_plugins.atlas_intelligent_ui`` and calls ``register(ctx)`` once. The implementation
lives in ``hermes_atlas/agent/plugin.py``; importing this module has no side effects and loads
only the standard library.
"""


def register(ctx):
    from .hermes_atlas.agent.plugin import register as register_atlas
    register_atlas(ctx)
