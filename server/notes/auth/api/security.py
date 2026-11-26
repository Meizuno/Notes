"""The gate: who is asking, renewing their session in passing.

Three dependencies, for three kinds of route:

- `get_viewer` — public reads (the notes, the tree, the graph, pages, the
  sitemap). Anonymous is an answer, not an error: the visibility rule turns
  `None` into "PUBLIC only".
- `get_user_id` — writes and the account's own routes. 401 without a session.
- `get_caller` — /api/mcp and /api/prompts/notes, which ai-chat reaches with a
  personal API token as `Authorization: Bearer`; a session works there too.

A session is the access JWT — from `Authorization: Bearer` or the
`notes_access` cookie — and, when that has lapsed, the `notes_refresh` cookie,
which is rotated on the spot so a request never fails merely because fifteen
minutes went by. The rotated pair reaches the browser through
SessionCookieWriter, whatever kind of response this turns out to be.
"""

from fastapi import Depends, Request

from notes.auth.api.cookies import ACCESS_COOKIE, REFRESH_COOKIE, forget, remember
from notes.auth.api.dependencies import (
    get_access_tokens,
    get_allow_list,
    get_rotate_session_use_case,
)
from notes.auth.exceptions import SessionExpired, Unauthorized
from notes.auth.models import AllowList
from notes.auth.ports import AccessTokens, ApiTokenResolver
from notes.auth.use_cases.rotate_session import (
    RotateSessionCommand,
    RotateSessionUseCase,
)
from notes.shared.api.dependencies import get_api_token_resolver
from notes.token.models import is_api_token


def bearer(request: Request) -> str | None:
    """The token in `Authorization: Bearer …`, or None without one. The
    scheme is matched case-insensitively, as the Nuxt app did."""
    header = request.headers.get("authorization", "")
    if header[:7].lower() == "bearer ":
        return header[7:].strip()
    return None


async def resolve_user_id(
    request: Request,
    access_tokens: AccessTokens,
    rotate: RotateSessionUseCase,
) -> str:
    """The signed-in user, renewing the session in place if it has lapsed.

    Raises SessionExpired when there is no session to be had, having asked
    for the dead cookies to be dropped — but only when the request carried
    any: an anonymous visitor's responses stay free of Set-Cookie, which is
    what lets a shared cache keep the public sitemap.
    """
    presented = bearer(request)
    token = (
        presented if presented is not None else request.cookies.get(ACCESS_COOKIE, "")
    )
    if token and not is_api_token(token):
        user_id = access_tokens.parse(token)
        if user_id:
            return user_id

    refresh = request.cookies.get(REFRESH_COOKIE, "")
    if not refresh:
        if request.cookies.get(ACCESS_COOKIE):
            forget(request)
        raise SessionExpired("sign in to continue")

    try:
        signed_in = await rotate.execute(
            RotateSessionCommand(
                refresh_token=refresh,
                user_agent=request.headers.get("user-agent", ""),
            )
        )
    except SessionExpired:
        forget(request)
        raise
    remember(request, signed_in.tokens)
    return signed_in.account.id


async def get_viewer(
    request: Request,
    access_tokens: AccessTokens = Depends(get_access_tokens),
    rotate: RotateSessionUseCase = Depends(get_rotate_session_use_case),
) -> str | None:
    """The signed-in user's id, or None for an anonymous visitor."""
    try:
        return await resolve_user_id(request, access_tokens, rotate)
    except SessionExpired:
        return None


def signed_in(viewer: str | None) -> str:
    """The viewer, or 401. For the note writes, whose handlers read the body
    BEFORE asking for a session — as the Nuxt handlers did, so an anonymous
    request with a malformed body is told about the body (400), not the
    session. A `get_user_id` dependency would refuse first."""
    if viewer is None:
        raise Unauthorized()
    return viewer


async def get_user_id(
    request: Request,
    access_tokens: AccessTokens = Depends(get_access_tokens),
    rotate: RotateSessionUseCase = Depends(get_rotate_session_use_case),
) -> str:
    """A session, or 401 — the Nuxt app's `requireAuthUser`."""
    try:
        return await resolve_user_id(request, access_tokens, rotate)
    except SessionExpired as expired:
        raise Unauthorized() from expired


async def get_caller(
    request: Request,
    access_tokens: AccessTokens = Depends(get_access_tokens),
    rotate: RotateSessionUseCase = Depends(get_rotate_session_use_case),
    api_tokens: ApiTokenResolver = Depends(get_api_token_resolver),
    allowed: AllowList = Depends(get_allow_list),
) -> str:
    """A personal API token or a session; the user id either stands for.

    A token is checked against the allow-list on every use: taking an address
    off the list stops that person's tokens at once, not when they expire.
    """
    presented = bearer(request)
    if presented is not None and is_api_token(presented):
        owner = await api_tokens.resolve(presented)
        if owner is None:
            raise Unauthorized("that API token is not valid")
        user_id, email = owner
        if not allowed.admits(email):
            raise Unauthorized("that API token's owner is not allowed here")
        return user_id
    return await get_user_id(request, access_tokens, rotate)
