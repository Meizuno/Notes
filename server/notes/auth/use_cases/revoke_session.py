from dataclasses import dataclass

from notes.auth.ports import RefreshTokenRepository
from notes.shared.adapters import hash_token


@dataclass(frozen=True)
class RevokeSessionCommand:
    refresh_token: str


class RevokeSessionUseCase:
    """Signing out on this device.

    Revokes the whole rotation family, so a stolen copy of the refresh token
    dies with it. An unknown token is not an error: the caller wanted to be
    signed out, and they are.
    """

    def __init__(self, refresh_tokens: RefreshTokenRepository) -> None:
        self._refresh_tokens = refresh_tokens

    async def execute(self, command: RevokeSessionCommand) -> None:
        if not command.refresh_token:
            return
        stored = await self._refresh_tokens.find_by_hash(
            hash_token(command.refresh_token)
        )
        if stored is not None:
            await self._refresh_tokens.revoke_family(stored.family)
