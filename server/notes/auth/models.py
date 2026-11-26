from dataclasses import dataclass
from datetime import datetime, timedelta

from notes.auth.exceptions import BadEmail

# How long a just-rotated refresh token keeps working.
#
# The server rotates on whichever request arrives first, and a page load fires
# several at once — all still carrying the same cookie, because the browser
# has not seen the new one yet. Without this window the second request would
# look like a replay and sign somebody out for simply loading a page. A stolen
# token also works inside it; outside it, reuse burns the whole family.
REUSE_GRACE = timedelta(seconds=20)


def normalize_email(value: str) -> str:
    """The form an address is stored, compared and allow-listed in."""
    return value.strip().lower()


@dataclass(frozen=True)
class Email:
    """An address as typed, checked loosely — Google has proved the real ones,
    and the dev sign-in only needs to refuse what is plainly not an address."""

    value: str

    def __post_init__(self) -> None:
        cleaned = normalize_email(self.value)
        at = cleaned.find("@")
        host = cleaned[at + 1 :] if at >= 0 else ""
        valid = (
            at > 0
            and at < len(cleaned) - 1
            and not any(c in cleaned for c in " \t\r\n")
            and "." in host
            and not host.startswith(".")
            and not host.endswith(".")
        )
        if not valid:
            raise BadEmail("enter a valid email address")
        object.__setattr__(self, "value", cleaned)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class AllowList:
    """Who may sign in at all.

    The vault holds somebody's notes, so it is closed by default: an empty
    list admits nobody. Checked at every door — Google, the dev sign-in — and
    again whenever a session is renewed, so taking an address off the list
    ends that person's access within one access-token lifetime.
    """

    emails: frozenset[str]

    def admits(self, email: str) -> bool:
        return normalize_email(email) in self.emails


@dataclass(kw_only=True)
class Account:
    """Somebody who has signed in here.

    `id` is text: accounts imported from the central SSO keep the SSO's id,
    which is what notes.user_id already holds. New ones get a uuid4.
    """

    id: str
    email: str
    name: str | None = None
    picture: str | None = None

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Account):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)


@dataclass(kw_only=True)
class RefreshToken:
    """One link in a rotation chain.

    `family` ties the chain together: every rotation issues a new token
    carrying the same family, so presenting a spent one can revoke the lot.
    """

    id: int = 0
    user_id: str
    token_hash: str
    family: str
    expires_at: datetime
    used_at: datetime | None = None
    revoked_at: datetime | None = None
    user_agent: str = ""

    def __post_init__(self) -> None:
        if not self.token_hash:
            raise ValueError("token_hash cannot be empty")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def is_dead(self, now: datetime) -> bool:
        """Revoked or expired is dead regardless of anything else — checked
        before the grace window, so that window can never resurrect a session
        somebody deliberately signed out of."""
        return self.is_revoked or self.is_expired(now)

    def within_grace(self, now: datetime) -> bool:
        """Spent, but recently enough to be a concurrent tab rather than a
        replay. See REUSE_GRACE."""
        return self.used_at is not None and now - self.used_at <= REUSE_GRACE


@dataclass(frozen=True)
class TokenPair:
    """The result of signing in or rotating. In transit only — the refresh
    token's hash is what gets persisted, never the token itself."""

    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class SignedIn:
    """What every sign-in path hands back: who, and the pair to set."""

    account: Account
    tokens: TokenPair


@dataclass(frozen=True)
class GoogleProfile:
    """The subset of Google's userinfo response this app needs."""

    sub: str
    email: str
    name: str = ""
    picture: str = ""
    email_verified: bool = False
