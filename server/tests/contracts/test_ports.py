"""Every implementation of a port really implements it — the fakes included.

`isinstance` against a Protocol only asks whether the methods exist, so this
compares parameter names and order as well: a fake that has lost a parameter
still passes isinstance, and then the use-case tests built on it are quietly
testing fiction.
"""

import inspect

import pytest

from notes.auth.google import GoogleOAuthClient
from notes.auth.ports import (
    AccessTokens,
    AccountRepository,
    ApiTokenResolver,
    GoogleSignIn,
    RefreshTokenRepository,
    SessionIssuer,
)
from notes.auth.repositories import (
    JwtAccessTokens,
    SessionTokenIssuer,
    SqlAccountRepository,
    SqlRefreshTokenRepository,
)
from notes.shared.adapters import SecretsRandomTokens, SystemClock
from notes.shared.ports import Clock, Logger, RandomTokens
from notes.token.ports import TokenRepository
from notes.token.repositories import SqlTokenRepository, TokenPrincipals
from notes.vault.ports import NoteRepository
from notes.vault.repositories import SqlNoteRepository
from tests import fakes

IMPLEMENTATIONS: list[tuple[type, type]] = [
    (NoteRepository, SqlNoteRepository),
    (NoteRepository, fakes.FakeNoteRepository),
    (AccountRepository, SqlAccountRepository),
    (AccountRepository, fakes.FakeAccountRepository),
    (RefreshTokenRepository, SqlRefreshTokenRepository),
    (RefreshTokenRepository, fakes.FakeRefreshTokenRepository),
    (SessionIssuer, SessionTokenIssuer),
    (SessionIssuer, fakes.FakeSessionIssuer),
    (AccessTokens, JwtAccessTokens),
    (GoogleSignIn, GoogleOAuthClient),
    (ApiTokenResolver, TokenPrincipals),
    (TokenRepository, SqlTokenRepository),
    (TokenRepository, fakes.FakeTokenRepository),
    (Clock, SystemClock),
    (Clock, fakes.FakeClock),
    (RandomTokens, SecretsRandomTokens),
    (RandomTokens, fakes.FakeRandomTokens),
    (Logger, fakes.FakeLogger),
]

CASES = [
    pytest.param(port, impl, id=f"{impl.__name__} is a {port.__name__}")
    for port, impl in IMPLEMENTATIONS
]


def _methods(port: type) -> list[str]:
    return sorted(
        name
        for name, value in vars(port).items()
        if not name.startswith("_") and callable(value)
    )


@pytest.mark.parametrize(("port", "implementation"), CASES)
class TestEveryImplementationSatisfiesItsPort:
    def test_it_has_every_method(self, port, implementation):
        missing = [m for m in _methods(port) if not hasattr(implementation, m)]
        assert not missing, f"{implementation.__name__} is missing {missing}"

    def test_with_the_same_parameters(self, port, implementation):
        for name in _methods(port):
            declared = inspect.signature(getattr(port, name))
            actual = inspect.signature(getattr(implementation, name))
            assert [p.name for p in declared.parameters.values()] == [
                p.name for p in actual.parameters.values()
            ], f"{implementation.__name__}.{name}"

    def test_async_where_the_port_is(self, port, implementation):
        for name in _methods(port):
            assert inspect.iscoroutinefunction(
                getattr(port, name)
            ) == inspect.iscoroutinefunction(getattr(implementation, name)), name
