"""Keep every test away from the real Hermes home and Atlas library.

Developer machines usually export ``HERMES_HOME``; without this fixture a test that forgets to
set ``ATLAS_DATA_DIR`` would open the live ``plugin-data/hermes-atlas/atlas.db``.
"""
import pytest


@pytest.fixture(autouse=True)
def isolated_hermes_home(tmp_path_factory, monkeypatch):
    home = tmp_path_factory.mktemp("hermes-home")
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("ATLAS_DATA_DIR", str(home / "plugin-data" / "hermes-atlas"))
    for name in ("ATLAS_HERMES_URL", "ATLAS_HERMES_API_KEY", "API_SERVER_KEY"):
        monkeypatch.delenv(name, raising=False)
    yield home
