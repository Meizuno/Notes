from typing import cast

import asyncpg
from fastapi import Depends, Request

from notes.auth.models import AllowList
from notes.auth.ports import (
    AccessTokens,
    AccountRepository,
    RefreshTokenRepository,
    SessionIssuer,
)
from notes.auth.repositories import (
    SessionTokenIssuer,
    SqlAccountRepository,
    SqlRefreshTokenRepository,
)
from notes.auth.use_cases.read_account import ReadAccountUseCase
from notes.auth.use_cases.revoke_session import RevokeSessionUseCase
from notes.auth.use_cases.rotate_session import RotateSessionUseCase
from notes.auth.use_cases.sign_in_as_developer import SignInAsDeveloperUseCase
from notes.auth.use_cases.sign_in_with_google import SignInWithGoogleUseCase
from notes.shared.api.dependencies import (
    get_app_logger,
    get_clock,
    get_connection,
    get_random_tokens,
    get_settings,
)
from notes.shared.config import Settings
from notes.shared.ports import Clock, Logger, RandomTokens


async def get_account_repo(
    connection: asyncpg.Connection = Depends(get_connection),
) -> AccountRepository:
    return SqlAccountRepository(connection)


async def get_refresh_token_repo(
    connection: asyncpg.Connection = Depends(get_connection),
) -> RefreshTokenRepository:
    return SqlRefreshTokenRepository(connection)


async def get_access_tokens(request: Request) -> AccessTokens:
    """The one verifier, built in lifespan — application-scoped because it
    remembers the tokens it has already verified."""
    return cast(AccessTokens, request.app.state.access_tokens)


async def get_allow_list(settings: Settings = Depends(get_settings)) -> AllowList:
    return AllowList(settings.allowed)


async def get_session_issuer(
    refresh_tokens: RefreshTokenRepository = Depends(get_refresh_token_repo),
    access_tokens: AccessTokens = Depends(get_access_tokens),
    random: RandomTokens = Depends(get_random_tokens),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
) -> SessionIssuer:
    return SessionTokenIssuer(
        refresh_tokens, access_tokens, random, clock, settings.refresh_ttl
    )


async def get_rotate_session_use_case(
    accounts: AccountRepository = Depends(get_account_repo),
    refresh_tokens: RefreshTokenRepository = Depends(get_refresh_token_repo),
    sessions: SessionIssuer = Depends(get_session_issuer),
    clock: Clock = Depends(get_clock),
    logger: Logger = Depends(get_app_logger),
    allowed: AllowList = Depends(get_allow_list),
) -> RotateSessionUseCase:
    return RotateSessionUseCase(
        accounts, refresh_tokens, sessions, clock, logger, allowed
    )


async def get_revoke_session_use_case(
    refresh_tokens: RefreshTokenRepository = Depends(get_refresh_token_repo),
) -> RevokeSessionUseCase:
    return RevokeSessionUseCase(refresh_tokens)


async def get_google_sign_in_use_case(
    accounts: AccountRepository = Depends(get_account_repo),
    sessions: SessionIssuer = Depends(get_session_issuer),
    allowed: AllowList = Depends(get_allow_list),
) -> SignInWithGoogleUseCase:
    return SignInWithGoogleUseCase(accounts, sessions, allowed)


async def get_dev_sign_in_use_case(
    accounts: AccountRepository = Depends(get_account_repo),
    sessions: SessionIssuer = Depends(get_session_issuer),
    allowed: AllowList = Depends(get_allow_list),
) -> SignInAsDeveloperUseCase:
    return SignInAsDeveloperUseCase(accounts, sessions, allowed)


async def get_read_account_use_case(
    accounts: AccountRepository = Depends(get_account_repo),
) -> ReadAccountUseCase:
    return ReadAccountUseCase(accounts)
