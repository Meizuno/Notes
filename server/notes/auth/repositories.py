import time
from datetime import datetime, timedelta

import asyncpg
import jwt

from notes.auth.models import Account, RefreshToken, TokenPair
from notes.auth.ports import AccessTokens, RefreshTokenRepository
from notes.shared.adapters import hash_token
from notes.shared.ports import Clock, RandomTokens

# Identifies tokens this server issued, so one signed by something else that
# happens to share the secret is refused rather than trusted. Changing it
# signs out everybody holding a live access token.
JWT_ISSUER = "notes"
JWT_ALGORITHM = "HS256"

_ACCOUNT_COLUMNS = "id, email, name, picture"


def _to_account(row: asyncpg.Record) -> Account:
    return Account(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        picture=row["picture"],
    )


class SqlAccountRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def find_by_id(self, user_id: str) -> Account | None:
        row = await self._connection.fetchrow(
            f"SELECT {_ACCOUNT_COLUMNS} FROM users WHERE id = $1", user_id
        )
        return _to_account(row) if row else None

    async def find_by_email(self, email: str) -> Account | None:
        row = await self._connection.fetchrow(
            f"SELECT {_ACCOUNT_COLUMNS} FROM users WHERE email = $1", email
        )
        return _to_account(row) if row else None

    async def create(
        self, email: str, name: str | None, picture: str | None
    ) -> Account:
        # ON CONFLICT so two first sign-ins arriving together (two tabs back
        # from Google) end with one account rather than a 500 for the loser.
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO users (email, name, picture) VALUES ($1, $2, $3)
            ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
            RETURNING {_ACCOUNT_COLUMNS}
            """,
            email,
            name,
            picture,
        )
        assert row is not None  # noqa: S101 - RETURNING always yields a row
        return _to_account(row)

    async def update_profile(
        self, user_id: str, name: str | None, picture: str | None
    ) -> Account | None:
        row = await self._connection.fetchrow(
            f"""
            UPDATE users
               SET name = COALESCE($2, name), picture = COALESCE($3, picture)
             WHERE id = $1
            RETURNING {_ACCOUNT_COLUMNS}
            """,
            user_id,
            name,
            picture,
        )
        return _to_account(row) if row else None


def _to_refresh(row: asyncpg.Record) -> RefreshToken:
    return RefreshToken(
        id=row["id"],
        user_id=row["user_id"],
        token_hash=row["token_hash"],
        family=row["family"],
        user_agent=row["user_agent"] or "",
        expires_at=row["expires_at"],
        used_at=row["used_at"],
        revoked_at=row["revoked_at"],
    )


_REFRESH_COLUMNS = (
    "id, user_id, token_hash, family, user_agent, expires_at, used_at, revoked_at"
)


class SqlRefreshTokenRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def create(self, token: RefreshToken) -> RefreshToken:
        row = await self._connection.fetchrow(
            f"""
            INSERT INTO refresh_tokens
                (user_id, token_hash, family, user_agent, expires_at)
            VALUES ($1, $2, COALESCE($3::text, gen_random_uuid()::text), $4, $5)
            RETURNING {_REFRESH_COLUMNS}
            """,
            token.user_id,
            token.token_hash,
            token.family or None,
            token.user_agent[:255],
            token.expires_at,
        )
        assert row is not None  # noqa: S101 - RETURNING always yields a row
        return _to_refresh(row)

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None:
        row = await self._connection.fetchrow(
            f"SELECT {_REFRESH_COLUMNS} FROM refresh_tokens WHERE token_hash = $1",
            token_hash,
        )
        return _to_refresh(row) if row else None

    async def mark_used(self, token_id: int) -> bool:
        # The WHERE re-checks everything the caller read a moment ago, so of
        # two concurrent requests only the first gets a row back. RETURNING,
        # not rowcount: asyncpg reports that as a string to be parsed.
        spent = await self._connection.fetchval(
            """
            UPDATE refresh_tokens SET used_at = now()
            WHERE id = $1
              AND used_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING id
            """,
            token_id,
        )
        return spent is not None

    async def revoke_family(self, family: str) -> None:
        await self._connection.execute(
            """
            UPDATE refresh_tokens SET revoked_at = now()
            WHERE family = $1 AND revoked_at IS NULL
            """,
            family,
        )


# A refresh token per sign-in and per rotation, and none ever read again once
# it has expired. Swept at boot — this server restarts on every release, and
# an already-clean table answers in microseconds.
_FORGET_REFRESH = (
    "DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days'"
)


async def forget_spent_sessions(pool: asyncpg.Pool) -> int:
    """Drop refresh tokens that can never be presented again; how many went."""
    async with pool.acquire() as connection:
        tag: str = await connection.execute(_FORGET_REFRESH)
    _, _, rows = tag.rpartition(" ")
    return int(rows) if rows.isdigit() else 0


# Verified tokens remembered until they expire: a token is presented on every
# request, and verifying the same signature again costs pure-Python time each
# time. Nothing is trusted from here that was not checked on the way in, and
# expiry is checked on every read.
MAX_REMEMBERED_TOKENS = 4096


class JwtAccessTokens:
    """HS256 access tokens, signed with the deployment's secret.

    Built once per process rather than per request, because it carries the
    map of tokens it has already verified.
    """

    def __init__(self, secret: str, ttl: timedelta) -> None:
        self._secret = secret
        self._ttl = ttl
        self._verified: dict[str, tuple[str, float]] = {}

    def sign(self, user_id: str, now: datetime) -> str:
        return jwt.encode(
            {"sub": user_id, "iss": JWT_ISSUER, "iat": now, "exp": now + self._ttl},
            self._secret,
            algorithm=JWT_ALGORITHM,
        )

    def parse(self, token: str) -> str | None:
        remembered = self._verified.get(token)
        if remembered is not None:
            subject, expires_at = remembered
            if expires_at > time.time():
                return subject
            del self._verified[token]

        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[JWT_ALGORITHM],
                issuer=JWT_ISSUER,
                options={"require": ["exp", "sub", "iss"]},
            )
        except jwt.PyJWTError:
            return None
        signed_for = claims.get("sub")
        if not isinstance(signed_for, str) or not signed_for:
            return None
        expiry = claims.get("exp")
        if isinstance(expiry, int | float):
            if len(self._verified) >= MAX_REMEMBERED_TOKENS:
                self._verified.clear()
            self._verified[token] = (signed_for, float(expiry))
        return signed_for


class SessionTokenIssuer:
    """Issues the access + refresh pair and records the refresh half."""

    def __init__(
        self,
        refresh_tokens: RefreshTokenRepository,
        access_tokens: AccessTokens,
        random: RandomTokens,
        clock: Clock,
        refresh_ttl: timedelta,
    ) -> None:
        self._refresh_tokens = refresh_tokens
        self._access_tokens = access_tokens
        self._random = random
        self._clock = clock
        self._refresh_ttl = refresh_ttl

    async def issue(
        self, user_id: str, *, family: str = "", user_agent: str = ""
    ) -> TokenPair:
        now = self._clock.now()
        raw = self._random.token()
        await self._refresh_tokens.create(
            RefreshToken(
                user_id=user_id,
                token_hash=hash_token(raw),
                family=family,
                user_agent=user_agent,
                expires_at=now + self._refresh_ttl,
            )
        )
        return TokenPair(
            access_token=self._access_tokens.sign(user_id, now),
            refresh_token=raw,
        )
