from dataclasses import dataclass
from datetime import datetime

# Marks this app's API tokens, so one can be told apart from a session access
# token (a JWT) before any database work happens.
API_TOKEN_PREFIX = "notes_pat_"  # noqa: S105 - a prefix, not a secret

NAME_MAX = 100


def is_api_token(raw: str) -> bool:
    return raw.startswith(API_TOKEN_PREFIX)


@dataclass(kw_only=True)
class ApiToken:
    """A token somebody minted so ai-chat can reach their notes.

    It stands for its owner on /api/mcp and /api/prompts/notes — nowhere
    else, and never for minting or revoking tokens. No scopes: those two
    endpoints are the whole of what a token is for. The raw value is never
    stored, only its sha256, so this can be listed without being usable.
    """

    id: int
    user_id: str
    name: str
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ApiToken):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)


@dataclass(frozen=True)
class TokenOwner:
    """Who a presented token turns out to be: the id it acts as, and the
    address the allow-list is asked about."""

    user_id: str
    email: str
