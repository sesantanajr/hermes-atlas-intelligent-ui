"""The agent side of Atlas: tools, skill, slash command, CLI and hooks.

Nothing in this package imports FastAPI, httpx or the HTTP layer; pydantic and SQLite are
imported inside the handlers that need them.
"""
