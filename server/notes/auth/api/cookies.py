from datetime import timedelta
from typing import Final, Literal

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from notes.auth.models import TokenPair

# Named for this app, never `access_token` / `refresh_token`.
#
# Those are the central SSO's names, and it sets them on `.meizuno.com`, so a
# browser signed in to any sibling app sends them here too. A parser building
# a dict keeps the last of two cookies with one name, and the SSO's would
# silently replace ours on every request — Forma lost three sign-ins in ninety
# minutes to exactly that before it renamed its own. Host-only (no Domain), so
# nothing here reaches the siblings either.
ACCESS_COOKIE: Final = "notes_access"
REFRESH_COOKIE: Final = "notes_refresh"

# Both at the root. The refresh cookie has to reach page requests as well as
# the API, because the server renews the session in passing wherever it looks
# at one: `/new` and `/login` decide where to send somebody by whether they
# are signed in, and an access token that lapsed while the tab was idle must
# not read as "signed out" there. Every use rotates it, it is HttpOnly,
# SameSite=Lax and host-only.
SESSION_PATH: Final = "/"

# Lax, not Strict: the OAuth callback arrives as a cross-site navigation from
# google.com, and Strict would withhold the cookie.
SAME_SITE: Literal["lax"] = "lax"

# Starlette's delete_cookie() renders expires=0 as "now", which a client can
# still consider live. The epoch is unarguable.
EXPIRED: Final = "Thu, 01 Jan 1970 00:00:00 GMT"

# Where a request leaves word for SessionCookieWriter: a TokenPair to set, or
# CLEAR to drop the pair. On request.state, i.e. the ASGI scope's state dict.
PENDING_KEY: Final = "pending_session"
CLEAR: Final = "clear"


class SessionCookies:
    """Writes and expires the session pair.

    Both HttpOnly: no script on the page can read them, and the client learns
    who is signed in from /api/auth/me. Secure depends on the deployment — a
    browser drops Secure cookies on http://localhost.
    """

    def __init__(
        self, *, secure: bool, access_ttl: timedelta, refresh_ttl: timedelta
    ) -> None:
        self._secure = secure
        self._access_ttl = access_ttl
        self._refresh_ttl = refresh_ttl

    def write(self, response: Response, tokens: TokenPair) -> None:
        for name, value, ttl in (
            (ACCESS_COOKIE, tokens.access_token, self._access_ttl),
            (REFRESH_COOKIE, tokens.refresh_token, self._refresh_ttl),
        ):
            response.set_cookie(
                name,
                value,
                path=SESSION_PATH,
                max_age=int(ttl.total_seconds()),
                httponly=True,
                secure=self._secure,
                samesite=SAME_SITE,
            )

    def clear(self, response: Response) -> None:
        for name in (ACCESS_COOKIE, REFRESH_COOKIE):
            expire_cookie(response, name, SESSION_PATH, secure=self._secure)


def expire_cookie(
    response: Response, name: str, path: str, *, secure: bool = False
) -> None:
    """Expire one cookie. The path must match the one it was set with."""
    response.set_cookie(
        name,
        "",
        path=path,
        max_age=0,
        expires=EXPIRED,
        httponly=True,
        secure=secure,
        samesite=SAME_SITE,
    )


def remember(request: Request, tokens: TokenPair) -> None:
    """Have this response set the session pair, whatever kind it turns out to
    be — JSON, a redirect, the NDJSON stream, an MCP event stream."""
    setattr(request.state, PENDING_KEY, tokens)


def forget(request: Request) -> None:
    """Have this response drop the session pair."""
    setattr(request.state, PENDING_KEY, CLEAR)


class SessionCookieWriter:
    """Writes whatever the request left in PENDING_KEY onto the response head.

    The session is renewed in passing, by a dependency, on whichever request
    finds an expired access token — and a dependency can only add headers to
    a response that is built from a return value. The list of notes streams,
    pages and redirects are Response objects of their own, and the MCP
    endpoint is a different ASGI app altogether. Doing the write here, as the
    head goes out, is the one place every kind of response passes.
    """

    def __init__(self, app: ASGIApp, *, cookies: SessionCookies) -> None:
        self._app = app
        self._cookies = cookies

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        # Made here, before anything reads it, so the dict the route writes to
        # is the one this reads back.
        state: dict[str, object] = scope.setdefault("state", {})

        async def sending(message: Message) -> None:
            if message["type"] == "http.response.start":
                pending = state.get(PENDING_KEY)
                if pending is not None:
                    self._apply(message, pending)
            await send(message)

        await self._app(scope, receive, sending)

    def _apply(self, message: Message, pending: object) -> None:
        carrier = Response()
        if isinstance(pending, TokenPair):
            self._cookies.write(carrier, pending)
        else:
            self._cookies.clear(carrier)
        headers = MutableHeaders(scope=message)
        for name, value in carrier.raw_headers:
            if name == b"set-cookie":
                headers.append("set-cookie", value.decode("latin-1"))
