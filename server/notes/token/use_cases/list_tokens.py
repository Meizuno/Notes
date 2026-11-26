from dataclasses import dataclass

from notes.token.models import ApiToken
from notes.token.ports import TokenRepository


@dataclass(frozen=True)
class ListTokensCommand:
    user_id: str


class ListTokensUseCase:
    def __init__(self, tokens: TokenRepository) -> None:
        self._tokens = tokens

    async def execute(self, command: ListTokensCommand) -> list[ApiToken]:
        return await self._tokens.list_for_user(command.user_id)
