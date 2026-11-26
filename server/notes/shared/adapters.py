import hashlib
import secrets
from datetime import UTC, datetime
from typing import Any

import structlog


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class SecretsRandomTokens:
    def token(self) -> str:
        return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    """The digest a refresh token or an API token is stored as.

    sha256 rather than bcrypt: these are 32 bytes of entropy this server
    generated, so there is nothing to brute-force and no reason to pay a work
    factor on every request that presents one.
    """
    return hashlib.sha256(raw.encode()).hexdigest()


def get_logger(**initial: Any) -> Any:
    return structlog.get_logger(**initial)
