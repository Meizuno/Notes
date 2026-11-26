"""Refresh-token rotation and reuse — Forma's rules, plus the allow-list."""

from datetime import timedelta
from typing import Any

import pytest

from notes.auth.exceptions import SessionExpired
from notes.auth.models import REUSE_GRACE, Account, AllowList, RefreshToken
from notes.auth.use_cases.revoke_session import (
    RevokeSessionCommand,
    RevokeSessionUseCase,
)
from notes.auth.use_cases.rotate_session import (
    RotateSessionCommand,
    RotateSessionUseCase,
)
from notes.shared.adapters import hash_token
from tests.fakes import (
    FakeAccountRepository,
    FakeClock,
    FakeLogger,
    FakeRefreshTokenRepository,
    FakeSessionIssuer,
)

RAW = "a-refresh-token"


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def accounts():
    return FakeAccountRepository()


@pytest.fixture
def account(accounts: FakeAccountRepository) -> Account:
    return accounts.add("u1", "dev@example.com")


@pytest.fixture
def refresh_tokens(clock):
    return FakeRefreshTokenRepository(clock)


@pytest.fixture
def issuer():
    return FakeSessionIssuer()


@pytest.fixture
def logger():
    return FakeLogger()


@pytest.fixture
def allowed():
    return AllowList(frozenset({"dev@example.com"}))


@pytest.fixture
def rotate(accounts, refresh_tokens, issuer, clock, logger, allowed):
    return RotateSessionUseCase(
        accounts, refresh_tokens, issuer, clock, logger, allowed
    )


async def _store(
    refresh_tokens: FakeRefreshTokenRepository,
    account: Account,
    clock: FakeClock,
    **overrides: Any,
) -> RefreshToken:
    defaults = {
        "user_id": account.id,
        "token_hash": hash_token(RAW),
        "family": "family-1",
        "expires_at": clock.now() + timedelta(days=30),
    }
    return await refresh_tokens.create(RefreshToken(**{**defaults, **overrides}))


class TestRotateSession:
    async def test_rotates_an_unused_token_within_its_family(
        self, rotate, refresh_tokens, account, clock, issuer
    ):
        stored = await _store(refresh_tokens, account, clock)
        signed_in = await rotate.execute(RotateSessionCommand(RAW, user_agent="UA"))
        assert signed_in.account == account
        assert stored.used_at == clock.now()
        assert issuer.issued == [("u1", "family-1", "UA")]

    async def test_a_concurrent_tab_inside_the_grace_window_is_reissued(
        self, rotate, refresh_tokens, account, clock, issuer
    ):
        await _store(refresh_tokens, account, clock, used_at=clock.now())
        clock.advance(REUSE_GRACE)
        await rotate.execute(RotateSessionCommand(RAW))
        assert len(issuer.issued) == 1

    async def test_reuse_outside_the_grace_window_revokes_the_family(
        self, rotate, refresh_tokens, account, clock, logger, issuer
    ):
        stored = await _store(refresh_tokens, account, clock, used_at=clock.now())
        sibling = await _store(
            refresh_tokens, account, clock, token_hash=hash_token("next-one")
        )
        clock.advance(REUSE_GRACE + timedelta(seconds=1))
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand(RAW))
        assert stored.revoked_at is not None
        assert sibling.revoked_at is not None
        assert logger.events[0][0] == "refresh_token_replayed"
        assert issuer.issued == []

    @pytest.mark.parametrize("field", ["revoked_at", "expires_at"])
    async def test_a_dead_token_is_refused_even_inside_the_grace(
        self, rotate, refresh_tokens, account, clock, field
    ):
        await _store(
            refresh_tokens, account, clock, **{field: clock.now()}, used_at=clock.now()
        )
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand(RAW))

    async def test_an_unknown_or_empty_token_is_refused(self, rotate):
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand("nope"))
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand(""))

    async def test_an_account_taken_off_the_allow_list_is_signed_out(
        self, accounts, refresh_tokens, issuer, clock, logger
    ):
        account = accounts.add("u2", "gone@example.com")
        stored = await _store(refresh_tokens, account, clock)
        rotate = RotateSessionUseCase(
            accounts,
            refresh_tokens,
            issuer,
            clock,
            logger,
            AllowList(frozenset({"dev@example.com"})),
        )
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand(RAW))
        assert stored.revoked_at is not None
        assert issuer.issued == []

    async def test_a_deleted_account_is_signed_out(
        self, rotate, refresh_tokens, accounts, account, clock
    ):
        await _store(refresh_tokens, account, clock)
        del accounts.accounts[account.id]
        with pytest.raises(SessionExpired):
            await rotate.execute(RotateSessionCommand(RAW))


class TestRevokeSession:
    async def test_revokes_the_whole_family(self, refresh_tokens, account, clock):
        stored = await _store(refresh_tokens, account, clock)
        await RevokeSessionUseCase(refresh_tokens).execute(RevokeSessionCommand(RAW))
        assert stored.revoked_at is not None

    async def test_an_unknown_or_missing_token_is_not_an_error(self, refresh_tokens):
        await RevokeSessionUseCase(refresh_tokens).execute(RevokeSessionCommand("nope"))
        await RevokeSessionUseCase(refresh_tokens).execute(RevokeSessionCommand(""))
