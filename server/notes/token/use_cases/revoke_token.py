from dataclasses import dataclass

from notes.token.ports import TokenRepository


@dataclass(frozen=True)
class RevokeTokenCommand:
    user_id: str
    token_id: int


class RevokeTokenUseCase:
    """Revoking a token that is already gone is not an error: the caller
    wanted it not to work, and it does not. Answering 404 would only tell
    them whether somebody else revoked it first."""

    def __init__(self, tokens: TokenRepository) -> None:
        self._tokens = tokens

    async def execute(self, command: RevokeTokenCommand) -> None:
        await self._tokens.revoke(command.user_id, command.token_id)
