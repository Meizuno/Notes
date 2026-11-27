import secrets
from typing import Final
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from starlette import status

from notes.auth.api.cookies import SAME_SITE, expire_cookie, remember
from notes.auth.api.dependencies import get_google_sign_in_use_case
from notes.auth.exceptions import GoogleSignInFailed, NotAllowed
from notes.auth.google import (
    OAUTH_COOKIE_MAX_AGE,
    OAUTH_COOKIE_PATH,
    RETURN_COOKIE,
    STATE_COOKIE,
    GoogleOAuthClient,
)
from notes.auth.models import GoogleProfile
from notes.auth.use_cases.sign_in_with_google import (
    SignInWithGoogleCommand,
    SignInWithGoogleUseCase,
)
from notes.shared.adapters import get_logger
from notes.shared.api.dependencies import get_settings
from notes.shared.config import Settings

router = APIRouter(prefix="/auth", tags=["auth"])

# There is no sign-in page: signing in IS this route, a navigation that goes
# straight to Google's consent screen and comes back to where it started.
SIGN_IN_PATH: Final = "/api/auth/google"
# Where a failed sign-in lands, with `?auth_error=<code>` for the client to
# show. Never back into the sign-in itself: an address off the allow-list
# would go round Google's account picker for ever.
FAILED_SIGN_IN_PATH: Final = "/"


def sign_in_location(back: str) -> str:
    """The navigation that signs somebody in and returns them to `back` (a
    local path, query included). Checked again on the way in, by
    `_return_path`, so whatever builds this cannot open a redirect."""
    return f"{SIGN_IN_PATH}?return={quote(back, safe='/')}"


async def get_google_client(
    settings: Settings = Depends(get_settings),
) -> GoogleOAuthClient | None:
    if not settings.google_configured:
        return None
    return GoogleOAuthClient(
        settings.google_client_id,
        settings.google_client_secret,
        settings.google_redirect_url,
    )


def _return_path(request: Request) -> str:
    """A SAFE local return path from ?return= — never an absolute or
    scheme-relative URL, which is how an open redirect gets in."""
    wanted = request.query_params.get("return", "")
    if not wanted.startswith("/") or wanted.startswith("//"):
        return "/"
    return wanted


@router.get("/google")
async def start(
    request: Request,
    google: GoogleOAuthClient | None = Depends(get_google_client),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    """Sends the browser to Google's consent screen. The client's "Log in",
    /login and every page that needs a session are plain navigations here."""
    if google is None:
        get_logger().warning("google_sign_in_unconfigured")
        return _failed("auth_failed")
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(
        google.authorization_url(state), status_code=status.HTTP_302_FOUND
    )
    for name, value in ((STATE_COOKIE, state), (RETURN_COOKIE, _return_path(request))):
        response.set_cookie(
            name,
            value,
            path=OAUTH_COOKIE_PATH,
            max_age=OAUTH_COOKIE_MAX_AGE,
            httponly=True,
            secure=settings.cookies_are_secure,
            samesite=SAME_SITE,
        )
    return response


@router.get("/callback")
async def callback(
    request: Request,
    google: GoogleOAuthClient | None = Depends(get_google_client),
    sign_in: SignInWithGoogleUseCase = Depends(get_google_sign_in_use_case),
) -> RedirectResponse:
    """Google's redirect target: completes the flow and lands the browser.

    A failure is carried as `?auth_error=` on the home page, because the
    person arrives here by navigation and there is no fetch waiting to read a
    JSON body:
    `not_allowed` for an address off the allow-list, `auth_failed` for
    anything else (the reason goes to the log). The try/except is that
    translation, which is why this route, alone, has one.
    """
    back = request.cookies.get(RETURN_COOKIE, "/")
    if not back.startswith("/") or back.startswith("//"):
        back = "/"

    try:
        if google is None:
            raise GoogleSignInFailed("google sign-in is not configured")
        profile = await _exchange(request, google)
        signed_in = await sign_in.execute(
            SignInWithGoogleCommand(
                profile=profile,
                user_agent=request.headers.get("user-agent", ""),
            )
        )
    except NotAllowed:
        return _failed("not_allowed")
    except GoogleSignInFailed as failure:
        get_logger().info("google_sign_in_failed", reason=failure.message)
        return _failed("auth_failed")

    remember(request, signed_in.tokens)
    response = RedirectResponse(back, status_code=status.HTTP_302_FOUND)
    _drop_oauth_cookies(response)
    return response


async def _exchange(request: Request, google: GoogleOAuthClient) -> GoogleProfile:
    state = request.cookies.get(STATE_COOKIE, "")
    if not state or state != request.query_params.get("state", ""):
        raise GoogleSignInFailed("sign-in expired or was tampered with")
    if request.query_params.get("error"):
        raise GoogleSignInFailed("google sign-in was cancelled")
    code = request.query_params.get("code", "")
    if not code:
        raise GoogleSignInFailed("sign-in expired or was tampered with")
    return await google.exchange(code)


def _failed(code: str) -> RedirectResponse:
    response = RedirectResponse(
        f"{FAILED_SIGN_IN_PATH}?auth_error={code}", status_code=status.HTTP_302_FOUND
    )
    _drop_oauth_cookies(response)
    return response


def _drop_oauth_cookies(response: RedirectResponse) -> None:
    for name in (STATE_COOKIE, RETURN_COOKIE):
        expire_cookie(response, name, OAUTH_COOKIE_PATH)
