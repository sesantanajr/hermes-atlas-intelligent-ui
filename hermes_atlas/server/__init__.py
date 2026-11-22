"""HTTP layer: the API router shared by the dashboard tab, the Desktop extension and the standalone app.

Importing a submodule here requires FastAPI and httpx, both shipped with Hermes core. The agent
side of the plugin never imports this package.
"""
