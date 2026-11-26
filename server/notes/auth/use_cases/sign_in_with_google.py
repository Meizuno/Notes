from dataclasses import dataclass

from notes.auth.exceptions import GoogleSignInFailed
from notes.auth.models import AllowList, GoogleProfile, SignedIn
from notes.auth.ports import AccountRepository, SessionIssuer
from notes.auth.use_cases.admit import admit


@dataclass(frozen=True)
class SignInWithGoogleCommand:
    profile: GoogleProfile
    user_agent: str = ""


class SignInWithGoogleUseCase:
    """Resolves a Google sign-in to a local account and signs it in.

    Matched by e-mail — Google has verified the address, and the accounts
    imported from the SSO have nothing else to be matched by. An address that
    is not on the allow-list is refused before anything is written.
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

    async def execute(self, command: SignInWithGoogleCommand) -> SignedIn:
        profile = command.profile
        if not profile.sub or not profile.email:
            raise GoogleSignInFailed("google returned no account")
        # Accounts are matched by e-mail, so an unverified one would let a
        # Google user claim somebody else's account.
        if not profile.email_verified:
            raise GoogleSignInFailed("google account has no verified email address")

        account = await admit(
            self._accounts,
            self._allowed,
            profile.email,
            name=profile.name.strip() or None,
            picture=profile.picture.strip() or None,
        )
        return SignedIn(
            account=account,
            tokens=await self._sessions.issue(
                account.id, user_agent=command.user_agent
            ),
        )
