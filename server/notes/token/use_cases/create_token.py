from dataclasses import dataclass
from datetime import datetime

from notes.shared.adapters import hash_token
from notes.shared.ports import RandomTokens
from notes.token.exceptions import InvalidTokenRequest
from notes.token.models import API_TOKEN_PREFIX, NAME_MAX, ApiToken
from notes.token.ports import TokenRepository


@dataclass(frozen=True)
class CreateTokenCommand:
    user_id: str
    name: str
    expires_at: datetime | None = None


@dataclass(frozen=True)
class MintedToken:
    """The raw value is in here exactly once, on the way back to whoever
    asked for it. Nothing stores it."""

    raw: str
    token: ApiToken


class CreateTokenUseCase:
    def __init__(self, tokens: TokenRepository, random: RandomTokens) -> None:
        self._tokens = tokens
        self._random = random

    async def execute(self, command: CreateTokenCommand) -> MintedToken:
        name = command.name.strip()
        if not name:
            raise InvalidTokenRequest("a token needs a name")
        if len(name) > NAME_MAX:
            raise InvalidTokenRequest(
                f"a token's name is at most {NAME_MAX} characters"
            )

        raw = API_TOKEN_PREFIX + self._random.token()
        token = await self._tokens.create(
            user_id=command.user_id,
            name=name,
            token_hash=hash_token(raw),
            expires_at=command.expires_at,
        )
        return MintedToken(raw=raw, token=token)
