from fastapi import APIRouter, Depends, Query, Request

from notes.auth.api.cookies import remember
from notes.auth.api.dependencies import get_dev_sign_in_use_case
from notes.auth.api.schemas import MeResponse
from notes.auth.exceptions import DevLoginDisabled
from notes.auth.use_cases.sign_in_as_developer import (
    SignInAsDeveloperCommand,
    SignInAsDeveloperUseCase,
)
from notes.shared.api.dependencies import get_settings
from notes.shared.config import Settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/dev")
async def dev_sign_in(
    request: Request,
    email: str = Query(default=""),
    settings: Settings = Depends(get_settings),
    sign_in: SignInAsDeveloperUseCase = Depends(get_dev_sign_in_use_case),
) -> MeResponse:
    """Signs an allowed address in with no Google — development only.

    Answers like /api/auth/me, with the session cookies set, so the login
    page's dev form can fetch it and then go wherever it likes (behind
    code-server's /absproxy/ prefix a server-side redirect would not know
    where that is). 404 where NOTES_DEV_LOGIN is off or CLIENT_DIR is set,
    403 `not_allowed` for an address off the list, 400 for a non-address.
    """
    if not settings.dev_login_enabled:
        raise DevLoginDisabled(f"Page not found: {request.url.path}")
    signed_in = await sign_in.execute(
        SignInAsDeveloperCommand(
            email=email, user_agent=request.headers.get("user-agent", "")
        )
    )
    remember(request, signed_in.tokens)
    return MeResponse.from_domain(signed_in.account)
