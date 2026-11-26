from datetime import datetime
from typing import Any, Protocol


class Clock(Protocol):
    """Time, injected so a use case can be tested without waiting for it."""

    def now(self) -> datetime: ...


class Logger(Protocol):
    """Structured logging. The first positional argument is a short, stable
    event name; keyword arguments are the fields."""

    def debug(self, event: str, **fields: Any) -> None: ...
    def info(self, event: str, **fields: Any) -> None: ...
    def warning(self, event: str, **fields: Any) -> None: ...
    def error(self, event: str, **fields: Any) -> None: ...
    def exception(self, event: str, **fields: Any) -> None: ...


class RandomTokens(Protocol):
    """Opaque secrets: refresh tokens, API tokens, OAuth state.

    A port rather than a direct `secrets` call so a test can make a token
    predictable without monkey-patching the standard library.
    """

    def token(self) -> str: ...
