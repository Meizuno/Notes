from fastapi import APIRouter, Depends, Request

from notes.auth.api.cookies import REFRESH_COOKIE, forget
from notes.auth.api.dependencies import (
    get_read_account_use_case,
    get_revoke_session_use_case,
)
from notes.auth.api.schemas import AuthConfigResponse, MeResponse, OkResponse
from notes.auth.api.security import get_user_id
from notes.auth.use_cases.read_account import ReadAccountCommand, ReadAccountUseCase
from notes.auth.use_cases.revoke_session import (
    RevokeSessionCommand,
    RevokeSessionUseCase,
)
from notes.shared.api.dependencies import get_settings
from notes.shared.config import Settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def me(
    user_id: str = Depends(get_user_id),
    read: ReadAccountUseCase = Depends(get_read_account_use_case),
) -> MeResponse:
    """Who is signed in — 401 when nobody is. What the client asks on boot."""
    return MeResponse.from_domain(await read.execute(ReadAccountCommand(user_id)))


@router.post("/refresh")
async def refresh(_user_id: str = Depends(get_user_id)) -> OkResponse:
    """`{"ok": true}` once there is a live session, 401 when there is none.

    The gate does the work: an access token that still verifies is the
    answer as it stands, and a lapsed one is renewed from the refresh cookie
    on the way through — the new pair rides out on this response. The client
    calls this once after a 401 and retries, as it did against the Nuxt app.
    """
    return OkResponse()


@router.post("/logout")
async def logout(
    request: Request,
    revoke: RevokeSessionUseCase = Depends(get_revoke_session_use_case),
) -> OkResponse:
    """Revokes the whole rotation family, so a stolen copy of the refresh
    token dies with it, and clears the cookies. Needs no session: signing out
    of one that is already gone is still signing out."""
    await revoke.execute(
        RevokeSessionCommand(refresh_token=request.cookies.get(REFRESH_COOKIE, ""))
    )
    forget(request)
    return OkResponse()


@router.get("/config")
async def config(settings: Settings = Depends(get_settings)) -> AuthConfigResponse:
    """Public: which sign-ins this deployment offers. `devLogin` is true only
    where GET /api/auth/dev answers."""
    return AuthConfigResponse(
        google=settings.google_configured,
        devLogin=settings.dev_login_enabled,
    )
