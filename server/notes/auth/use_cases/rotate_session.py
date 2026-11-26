from dataclasses import dataclass

from notes.auth.exceptions import SessionExpired
from notes.auth.models import AllowList, RefreshToken, SignedIn
from notes.auth.ports import AccountRepository, RefreshTokenRepository, SessionIssuer
from notes.shared.adapters import hash_token
from notes.shared.ports import Clock, Logger


@dataclass(frozen=True)
class RotateSessionCommand:
    refresh_token: str
    user_agent: str = ""


class RotateSessionUseCase:
    """Exchanges a refresh token for a fresh pair.

    The presented token is marked used by a statement that also checks it was
    unused, so two concurrent refreshes cannot both succeed. A token presented
    twice — outside the grace window — means it leaked, and the whole family
    is revoked, signing the thief and the owner out together.

    One rule Forma does not have: the account must still be on the allow-list.
    Taking an address off NOTES_ALLOWED_EMAILS therefore ends that person's
    access at their next renewal, at most one access-token lifetime later.
    """

    def __init__(
        self,
        accounts: AccountRepository,
        refresh_tokens: RefreshTokenRepository,
        sessions: SessionIssuer,
        clock: Clock,
        logger: Logger,
        allowed: AllowList,
    ) -> None:
        self._accounts = accounts
        self._refresh_tokens = refresh_tokens
        self._sessions = sessions
        self._clock = clock
        self._logger = logger
        self._allowed = allowed

    async def execute(self, command: RotateSessionCommand) -> SignedIn:
        if not command.refresh_token:
            raise SessionExpired("no refresh token")

        stored = await self._refresh_tokens.find_by_hash(
            hash_token(command.refresh_token)
        )
        if stored is None:
            raise SessionExpired("invalid or expired token")

        now = self._clock.now()
        # Revoked or expired is dead regardless of anything below — checked
        # first, so the grace window can never resurrect a signed-out session.
        if stored.is_dead(now):
            raise SessionExpired("invalid or expired token")

        if stored.used_at is not None:
            if not stored.within_grace(now):
                self._logger.warning("refresh_token_replayed", family=stored.family)
                await self._refresh_tokens.revoke_family(stored.family)
                raise SessionExpired("invalid or expired token")
            return await self._reissue(stored, command.user_agent)

        if not await self._refresh_tokens.mark_used(stored.id):
            # Something changed between the read and the update. Re-read to
            # find out what: a sibling request winning the race is benign,
            # revocation is not.
            return await self._after_lost_race(command)

        return await self._reissue(stored, command.user_agent)

    async def _after_lost_race(self, command: RotateSessionCommand) -> SignedIn:
        stored = await self._refresh_tokens.find_by_hash(
            hash_token(command.refresh_token)
        )
        now = self._clock.now()
        if stored is None or stored.is_dead(now) or not stored.within_grace(now):
            raise SessionExpired("invalid or expired token")
        return await self._reissue(stored, command.user_agent)

    async def _reissue(self, stored: RefreshToken, user_agent: str) -> SignedIn:
        account = await self._accounts.find_by_id(stored.user_id)
        if account is None:
            raise SessionExpired("invalid or expired token")
        if not self._allowed.admits(account.email):
            self._logger.info("session_refused_not_allowed", user_id=account.id)
            await self._refresh_tokens.revoke_family(stored.family)
            raise SessionExpired("this account is no longer allowed")
        return SignedIn(
            account=account,
            tokens=await self._sessions.issue(
                account.id, family=stored.family, user_agent=user_agent
            ),
        )
