from datetime import datetime
from typing import Protocol

from notes.token.models import ApiToken, TokenOwner


class TokenRepository(Protocol):
    async def create(
        self,
        user_id: str,
        name: str,
        token_hash: str,
        expires_at: datetime | None,
    ) -> ApiToken: ...

    async def list_for_user(self, user_id: str) -> list[ApiToken]:
        """The live ones, newest first."""

    async def revoke(self, user_id: str, token_id: int) -> bool:
        """Revoke one token, returning whether anything was still active."""

    async def resolve(self, token_hash: str) -> TokenOwner | None:
        """Who a live token stands for, or None when it is unknown, revoked
        or expired. Implementations also mark it used — the only moment we
        learn a token is still in service."""
