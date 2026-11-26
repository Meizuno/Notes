from datetime import datetime
from typing import Protocol

from notes.auth.models import Account, GoogleProfile, RefreshToken, TokenPair


class AccountRepository(Protocol):
    async def find_by_id(self, user_id: str) -> Account | None: ...

    async def find_by_email(self, email: str) -> Account | None:
        """By the normalized (lowercased) address."""

    async def create(
        self, email: str, name: str | None, picture: str | None
    ) -> Account:
        """A new account under a fresh uuid4. `email` is already normalized."""

    async def update_profile(
        self, user_id: str, name: str | None, picture: str | None
    ) -> Account | None:
        """Refresh what Google says about somebody on each sign-in. A None
        leaves that field as it was."""


class RefreshTokenRepository(Protocol):
    async def create(self, token: RefreshToken) -> RefreshToken:
        """Store a new token. An empty `family` starts a fresh chain, and the
        database picks the identifier for it."""

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None: ...

    async def mark_used(self, token_id: int) -> bool:
        """Spend a token, returning whether THIS call was the one that did.

        The statement checks it was unused in the same breath as marking it,
        so two concurrent refreshes cannot both succeed — which is what makes
        replay detectable at all.
        """

    async def revoke_family(self, family: str) -> None: ...


class AccessTokens(Protocol):
    """The short-lived bearer token the API trusts on every request.

    Stateless on purpose: no database read per request. Revocation therefore
    takes effect within the token's lifetime, which is why it is short.
    """

    def sign(self, user_id: str, now: datetime) -> str: ...

    def parse(self, token: str) -> str | None:
        """The user id carried by a valid, unexpired token, or None."""


class SessionIssuer(Protocol):
    """Mints the pair a signed-in session consists of. `family` empty starts
    a fresh chain, which is what a new sign-in wants."""

    async def issue(
        self, user_id: str, *, family: str = "", user_agent: str = ""
    ) -> TokenPair: ...


class GoogleSignIn(Protocol):
    """The Authorization-Code flow, as far as the use cases care about it."""

    async def exchange(self, code: str) -> GoogleProfile: ...


class ApiTokenResolver(Protocol):
    """Who a presented personal API token stands for.

    Declared here and implemented in the token module, the asymmetric way
    Forma does it: the gate accepts a token without auth/ importing token/ —
    which would be a cycle, since token/'s routes are behind this very gate.
    Speaks primitives for the same reason: (user id, e-mail), the e-mail so
    the gate can ask the allow-list about the token's owner.
    """

    async def resolve(self, raw: str) -> tuple[str, str] | None: ...
