from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from notes.auth.api.security import get_user_id
from notes.token.api.dependencies import (
    get_create_token_use_case,
    get_list_tokens_use_case,
    get_revoke_token_use_case,
)
from notes.token.api.schemas import (
    MintedTokenResponse,
    TokenListResponse,
    TokenResponse,
)
from notes.token.use_cases.create_token import CreateTokenCommand, CreateTokenUseCase
from notes.token.use_cases.list_tokens import ListTokensCommand, ListTokensUseCase
from notes.token.use_cases.revoke_token import RevokeTokenCommand, RevokeTokenUseCase

# Behind `get_user_id` — a session, never a token: a key left in a script must
# not be able to mint more keys, or list or revoke the owner's others.
router = APIRouter(prefix="/tokens", tags=["tokens"])


class TokenCreate(BaseModel):
    name: str = ""
    # Optional, ISO 8601. Blank or unparseable means "never expires", as in
    # Forma: failing the whole request over a malformed date would be worse.
    expiresAt: str = ""


@router.get("")
async def list_tokens(
    user_id: str = Depends(get_user_id),
    list_tokens: ListTokensUseCase = Depends(get_list_tokens_use_case),
) -> TokenListResponse:
    return TokenListResponse.from_domain(
        await list_tokens.execute(ListTokensCommand(user_id))
    )


@router.post("")
async def create_token(
    body: TokenCreate,
    user_id: str = Depends(get_user_id),
    create: CreateTokenUseCase = Depends(get_create_token_use_case),
) -> MintedTokenResponse:
    """Mints a token. The raw value is returned exactly once, here."""
    minted = await create.execute(
        CreateTokenCommand(
            user_id=user_id, name=body.name, expires_at=_expiry(body.expiresAt)
        )
    )
    return MintedTokenResponse(
        token=minted.raw, pat=TokenResponse.from_domain(minted.token)
    )


@router.delete("/{token_id}")
async def revoke_token(
    token_id: int,
    user_id: str = Depends(get_user_id),
    revoke: RevokeTokenUseCase = Depends(get_revoke_token_use_case),
    list_tokens: ListTokensUseCase = Depends(get_list_tokens_use_case),
) -> TokenListResponse:
    """Answers with what is left, so the client does not have to ask again."""
    await revoke.execute(RevokeTokenCommand(user_id=user_id, token_id=token_id))
    return TokenListResponse.from_domain(
        await list_tokens.execute(ListTokensCommand(user_id))
    )


def _expiry(value: str) -> datetime | None:
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
