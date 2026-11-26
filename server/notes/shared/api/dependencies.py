"""The composition root: what a request is given, and where it comes from.

Every provider here is `async def`, including the ones that only build an
object and return it — FastAPI runs a sync dependency in a worker thread, and
none of these block. See AGENTS.md.
"""

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import cast

import asyncpg
from fastapi import Depends, Request

from notes.auth.ports import ApiTokenResolver
from notes.shared.adapters import SecretsRandomTokens, SystemClock, get_logger
from notes.shared.config import Settings
from notes.shared.database import acquire
from notes.shared.ports import Clock, Logger, RandomTokens
from notes.token.repositories import SqlTokenRepository, TokenPrincipals


@lru_cache
def load_settings() -> Settings:
    """The settings, read once.

    Sync, because it is also called where there is no event loop: at startup
    in main.py, and by the tests. `get_settings` below is the dependency.
    """
    return Settings()


async def get_settings() -> Settings:
    return load_settings()


def get_pool(request: Request) -> asyncpg.Pool:
    # Not a dependency — called by get_connection, which is one. app.state is
    # populated in lifespan; mypy cannot infer what went on it.
    return cast(asyncpg.Pool, request.app.state.pool)


async def get_connection(request: Request) -> AsyncIterator[asyncpg.Connection]:
    async for connection in acquire(get_pool(request)):
        yield connection


_CLOCK = SystemClock()
_RANDOM_TOKENS = SecretsRandomTokens()


async def get_clock() -> Clock:
    return _CLOCK


async def get_random_tokens() -> RandomTokens:
    return _RANDOM_TOKENS


async def get_app_logger() -> Logger:
    return cast(Logger, get_logger())


async def get_api_token_resolver(
    connection: asyncpg.Connection = Depends(get_connection),
) -> ApiTokenResolver:
    """Bridges `auth.ports.ApiTokenResolver` to its implementation in the
    token module. The wiring lives here, in the composition root, so auth/
    never imports token/'s repositories."""
    return TokenPrincipals(SqlTokenRepository(connection))
