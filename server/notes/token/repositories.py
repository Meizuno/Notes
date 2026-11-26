from datetime import datetime

import asyncpg

from notes.shared.adapters import hash_token
from notes.token.models import ApiToken, TokenOwner, is_api_token
from notes.token.ports import TokenRepository

_COLUMNS = "id, user_id, name, created_at, last_used_at, expires_at, revoked_at"


def _to_token(row: asyncpg.Record) -> ApiToken:
    return ApiToken(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        created_at=row["created_at"],
        last_used_at=row["last_used_at"],
        expires_at=row["expires_at"],
        revoked_at=row["revoked_at"],
    )


class SqlTokenRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def create(
        self,
        user_id: str,
        name: str,
        token_hash: str,
        expires_at: datetime | None,
    ) -> ApiToken:
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING {_COLUMNS}
            """,
            user_id,
            name,
            token_hash,
            expires_at,
        )
        assert row is not None  # noqa: S101 - RETURNING always yields a row
        return _to_token(row)

    async def list_for_user(self, user_id: str) -> list[ApiToken]:
        rows = await self._connection.fetch(
            f"""
            SELECT {_COLUMNS} FROM api_tokens
            WHERE user_id = $1 AND revoked_at IS NULL
            ORDER BY created_at DESC, id DESC
            """,
            user_id,
        )
        return [_to_token(row) for row in rows]

    async def revoke(self, user_id: str, token_id: int) -> bool:
        revoked = await self._connection.fetchval(
            """
            UPDATE api_tokens SET revoked_at = now()
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            RETURNING id
            """,
            token_id,
            user_id,
        )
        return revoked is not None

    async def resolve(self, token_hash: str) -> TokenOwner | None:
        # Stamping last_used_at in the statement that reads the token: one
        # round trip, and no window where a token is used but not recorded.
        row = await self._connection.fetchrow(
            """
            UPDATE api_tokens AS t SET last_used_at = now()
              FROM users AS u
             WHERE t.token_hash = $1
               AND u.id = t.user_id
               AND t.revoked_at IS NULL
               AND (t.expires_at IS NULL OR t.expires_at > now())
            RETURNING t.user_id, u.email
            """,
            token_hash,
        )
        if row is None:
            return None
        return TokenOwner(user_id=row["user_id"], email=row["email"])


class TokenPrincipals:
    """Implements `notes.auth.ports.ApiTokenResolver`.

    The prefix check comes first and costs nothing: a session token looks
    nothing like an API token, so there is no reason to hash it or ask the
    database about it. Speaks primitives — (user id, e-mail) — so the auth
    module never has to know this one's types.
    """

    def __init__(self, tokens: TokenRepository) -> None:
        self._tokens = tokens

    async def resolve(self, raw: str) -> tuple[str, str] | None:
        if not is_api_token(raw):
            return None
        owner = await self._tokens.resolve(hash_token(raw))
        if owner is None:
            return None
        return owner.user_id, owner.email
