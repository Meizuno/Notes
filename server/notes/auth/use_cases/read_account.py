from dataclasses import dataclass

from notes.auth.exceptions import SessionExpired
from notes.auth.models import Account
from notes.auth.ports import AccountRepository


@dataclass(frozen=True)
class ReadAccountCommand:
    user_id: str


class ReadAccountUseCase:
    """Who the signed-in caller is, for /api/auth/me.

    A valid access token for an account that no longer exists is a session
    that is over, not a 404.
    """

    def __init__(self, accounts: AccountRepository) -> None:
        self._accounts = accounts

    async def execute(self, command: ReadAccountCommand) -> Account:
        account = await self._accounts.find_by_id(command.user_id)
        if account is None:
            raise SessionExpired("sign in to continue")
        return account
