"""Hermes Atlas: plugin entry point.

Hermes imports this file as ``hermes_plugins.hermes_atlas`` and calls ``register(ctx)`` once.
The implementation lives in ``hermes_atlas/agent/plugin.py``; importing this module has no side
effects and loads only the standard library.
"""


def register(ctx):
    from .hermes_atlas.agent.plugin import register as register_atlas
    register_atlas(ctx)
