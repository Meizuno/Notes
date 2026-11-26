from pydantic import BaseModel

from notes.shared.text import iso
from notes.token.models import ApiToken


class TokenResponse(BaseModel):
    """Forma's PAT shape, less its scopes: a notes token has none."""

    id: int
    name: str
    createdAt: str
    lastUsedAt: str | None = None
    expiresAt: str | None = None

    @classmethod
    def from_domain(cls, token: ApiToken) -> "TokenResponse":
        return cls(
            id=token.id,
            name=token.name,
            createdAt=iso(token.created_at),
            lastUsedAt=iso(token.last_used_at) if token.last_used_at else None,
            expiresAt=iso(token.expires_at) if token.expires_at else None,
        )


class TokenListResponse(BaseModel):
    pats: list[TokenResponse]

    @classmethod
    def from_domain(cls, tokens: list[ApiToken]) -> "TokenListResponse":
        return cls(pats=[TokenResponse.from_domain(t) for t in tokens])


class MintedTokenResponse(BaseModel):
    """The raw token appears here and nowhere else, ever again."""

    token: str
    pat: TokenResponse
