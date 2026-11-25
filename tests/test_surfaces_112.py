"""1.1.2: how a canvas is shown when Hermes reports the client of a turn (Hermes 0.23+).

Hermes 0.23 answers ``desktop`` as the surface of every local session a client opens with
``source: gui``: Hermes Desktop and the Webapp, but also other chat apps such as the Atlas portal.
A ``MEDIA:`` path is a dead link in those apps, while the ``::atlas`` line is what they draw.
"""
import pytest

from hermes_atlas.agent import surfaces
from hermes_atlas.storage.store import Store
from hermes_host import HostContext, registered

TRIP = {"title": "Viagem", "blocks": [
    {"type": "checklist", "id": "todo", "title": "Antes de sair", "items": ["Passaporte", "Seguro"]}]}


def host(surface="", **kwargs):
    ctx, _ = registered(HostContext, surface=surface, **kwargs)
    return ctx


@pytest.mark.parametrize("client, expected", [
    ({"name": "hermes-desktop", "kind": "desktop", "version": "0.23.4"}, "file"),
    ({"name": "hermes-webapp", "kind": "webapp"}, "file"),
    ({"name": "fork-of-desktop", "kind": "desktop"}, "file"),   # a renamed Desktop is still Desktop
    (False, "directive"),                                       # announced nothing: the Atlas portal
    ({"name": "atlas-portal", "kind": "web"}, "directive"),     # another chat app
])
def test_desktop_surface_follows_the_turn_client(client, expected):
    ctx = host("desktop", client=client)
    result = ctx.call("atlas_render", {"canvas": TRIP})
    assert result["show"] == expected
    if expected == "directive":
        assert "file" not in result and result["directive"] in result["present"]
    else:
        assert result["media"] in result["present"]


def test_a_forced_style_still_wins_over_the_client():
    assert host("desktop", client=False, settings={"reply_style": "file"}).call(
        "atlas_render", {"canvas": TRIP})["show"] == "file"
    assert host("desktop", client=False, settings={"reply_style": "text"}).call(
        "atlas_render", {"canvas": TRIP})["show"] == "text"


def test_the_extension_on_an_older_desktop_still_gets_the_directive():
    ctx = host("desktop")
    Store().touch_client("desktop", {"version": "1.0.0", "features": []})
    assert ctx.call("atlas_render", {"canvas": TRIP})["show"] == "directive"


def test_messaging_text_never_offers_a_line_the_chat_cannot_draw():
    result = host("whatsapp").call("atlas_render", {"canvas": TRIP})
    assert result["show"] == "text"
    assert "do not write the ::atlas line" in result["present"] and "atlas_export" in result["present"]


def test_reading_the_client_never_breaks_a_tool():
    class Broken:
        def turn_client(self):
            raise RuntimeError("gateway gone")

    assert surfaces.current_client(Broken()) == (False, None)
    assert surfaces.current_client(object()) == (False, None)

    class Odd:
        def turn_client(self):
            return "hermes-desktop"  # not a dict: treated as no client

    assert surfaces.current_client(Odd()) == (True, None)
    assert surfaces.is_hermes_app({"name": "HERMES-DESKTOP"}) and not surfaces.is_hermes_app(None)
