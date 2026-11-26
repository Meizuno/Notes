import asyncpg
from fastapi import Depends

from notes.shared.api.dependencies import get_connection, get_random_tokens
from notes.shared.ports import RandomTokens
from notes.token.ports import TokenRepository
from notes.token.repositories import SqlTokenRepository
from notes.token.use_cases.create_token import CreateTokenUseCase
from notes.token.use_cases.list_tokens import ListTokensUseCase
from notes.token.use_cases.revoke_token import RevokeTokenUseCase


async def get_token_repo(
    connection: asyncpg.Connection = Depends(get_connection),
) -> TokenRepository:
    return SqlTokenRepository(connection)


async def get_create_token_use_case(
    tokens: TokenRepository = Depends(get_token_repo),
    random: RandomTokens = Depends(get_random_tokens),
) -> CreateTokenUseCase:
    return CreateTokenUseCase(tokens, random)


async def get_list_tokens_use_case(
    tokens: TokenRepository = Depends(get_token_repo),
) -> ListTokensUseCase:
    return ListTokensUseCase(tokens)


async def get_revoke_token_use_case(
    tokens: TokenRepository = Depends(get_token_repo),
) -> RevokeTokenUseCase:
    return RevokeTokenUseCase(tokens)
