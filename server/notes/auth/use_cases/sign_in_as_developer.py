from dataclasses import dataclass

from notes.auth.models import AllowList, Email, SignedIn
from notes.auth.ports import AccountRepository, SessionIssuer
from notes.auth.use_cases.admit import admit


@dataclass(frozen=True)
class SignInAsDeveloperCommand:
    email: str
    user_agent: str = ""


class SignInAsDeveloperUseCase:
    """Signs an allowed address in with no Google at all — development only.

    The route refuses to exist unless NOTES_DEV_LOGIN is on and CLIENT_DIR is
    not set; this use case still goes through the allow-list, so turning the
    flag on does not open the door to anybody the list would turn away.
    """

    def __init__(
        self,
        accounts: AccountRepository,
        sessions: SessionIssuer,
        allowed: AllowList,
    ) -> None:
        self._accounts = accounts
        self._sessions = sessions
        self._allowed = allowed

    async def execute(self, command: SignInAsDeveloperCommand) -> SignedIn:
        email = Email(command.email)
        local_part = email.value.split("@", 1)[0]
        account = await admit(
            self._accounts,
            self._allowed,
            email.value,
            name=local_part.capitalize(),
            refresh_profile=False,
        )
        return SignedIn(
            account=account,
            tokens=await self._sessions.issue(
                account.id, user_agent=command.user_agent
            ),
        )
