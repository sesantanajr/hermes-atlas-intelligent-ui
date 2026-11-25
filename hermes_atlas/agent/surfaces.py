"""Which Hermes surface a tool call is answering, and how that surface can show a canvas.

Three ways, best first:

- ``file``: the tool writes the canvas as a self-contained HTML page and the model ends its reply
  with ``MEDIA:<path>``. Every Hermes surface understands that line. Hermes Desktop and the
  Webapp draw it as a file card with a preview, and with the Atlas extension enabled (a Desktop
  with tool media renderers) as the live, interactive canvas. Messaging platforms deliver the file.
- ``directive``: the model writes ``::atlas{id="..." rev="..."}`` as its own paragraph. The Atlas
  extension draws it on Desktop releases that have transcript directives but not tool media
  renderers, the Atlas chat resolves it on the server, and chat apps built on Hermes's local
  sessions (the Atlas portal among them) replace it with the canvas page.
- ``text``: the model summarises the canvas in prose (terminals, messaging platforms), and
  ``atlas_export`` sends the page when the user asks for it.

Since Hermes 0.23, every session a client opens with ``source: gui`` answers ``desktop`` as its
surface, whether the client is Hermes Desktop or another app. The client that submitted the turn
(``ctx.turn_client()``, which Hermes Desktop and the Webapp fill with ``hermes-desktop`` and
``hermes-webapp``) tells them apart: a ``MEDIA:`` path only helps Hermes's own apps.
"""
import logging

logger = logging.getLogger(__name__)

STYLES = ("auto", "file", "directive", "text")
# The names Hermes Desktop and the Webapp announce in ``client.capabilities`` (apps/desktop,
# lib/client-identity.ts). Kinds are checked too, for forks that rename the app.
HERMES_APPS = frozenset({"hermes-desktop", "hermes-webapp"})
HERMES_APP_KINDS = frozenset({"desktop", "webapp"})


def current_surface(ctx):
    """``desktop``, ``cli``, ``tui``, ``telegram``, ``api_server`` ... or ``""`` when unknown."""
    reader = getattr(ctx, "session_surface", None)
    if callable(reader):
        try:
            found = reader()
            if isinstance(found, str) and found:
                return found.lower()
        except Exception as exc:
            logger.debug("Atlas could not read the session surface: %s", exc)
    try:
        from gateway.session_context import get_session_env
    except ImportError:
        return ""
    try:
        return (get_session_env("HERMES_SESSION_PLATFORM") or get_session_env("HERMES_SESSION_SOURCE") or "").lower()
    except Exception as exc:
        logger.debug("Atlas could not read the session platform: %s", exc)
        return ""


def current_client(ctx):
    """``(known, client)``: whether this Hermes reports the client that submitted the turn, and that
    client (``{"name", "version"?, "kind"?}``) or ``None`` when it announced nothing.

    A label the client chose, used only to pick how a canvas is shown; it grants nothing.
    """
    reader = getattr(ctx, "turn_client", None)
    if not callable(reader):
        return False, None
    try:
        found = reader()
    except Exception as exc:
        logger.debug("Atlas could not read the turn's client: %s", exc)
        return False, None
    return True, found if isinstance(found, dict) else None


def is_hermes_app(client):
    """Whether *client* is Hermes Desktop or the Webapp (the apps that draw ``MEDIA:`` pages)."""
    if not isinstance(client, dict):
        return False
    name, kind = str(client.get("name") or "").lower(), str(client.get("kind") or "").lower()
    return name in HERMES_APPS or kind in HERMES_APP_KINDS


def presentation(surface, *, style="auto", desktop_extension=False, desktop_media=False, atlas_chat=False,
                 client_known=False, client=None):
    """``file`` | ``directive`` | ``text`` | ``either``: how the model should present a canvas.

    ``desktop_extension``: the Atlas Desktop extension has been seen; ``desktop_media``: it runs on
    a Desktop that lets it draw the files Atlas tools produce (tool media renderers).
    ``client_known``/``client``: the turn's client, when this Hermes reports it.
    """
    if atlas_chat:  # the Atlas chat resolves the directive itself; a file would only be a path there
        return "text" if style == "text" else "directive"
    if style in ("file", "directive", "text"):
        return style
    if surface == "desktop":
        if client_known and not is_hermes_app(client):
            # A local session opened by another chat app (the Atlas portal): a MEDIA path would be a
            # dead link there, while the directive becomes the canvas page.
            return "directive"
        # An extension on a Desktop without tool media renderers draws only the directive. In every
        # other case the file is best: the extension draws it live, and without the extension the
        # user still gets the page as a previewable file card.
        return "directive" if desktop_extension and not desktop_media else "file"
    if surface in ("", "local"):
        return "either"
    return "text"  # terminals, messaging platforms and other API clients
