"""Both doors in — Google and the dev sign-in — and the allow-list in front."""

import pytest

from notes.auth.exceptions import (
    BadEmail,
    GoogleSignInFailed,
    NotAllowed,
    SessionExpired,
)
from notes.auth.models import AllowList, GoogleProfile
from notes.auth.use_cases.read_account import ReadAccountCommand, ReadAccountUseCase
from notes.auth.use_cases.sign_in_as_developer import (
    SignInAsDeveloperCommand,
    SignInAsDeveloperUseCase,
)
from notes.auth.use_cases.sign_in_with_google import (
    SignInWithGoogleCommand,
    SignInWithGoogleUseCase,
)
from tests.fakes import FakeAccountRepository, FakeSessionIssuer

ALLOWED = AllowList(frozenset({"dev@example.com", "alice@example.com"}))


def _profile(email: str = "Alice@Example.com", **overrides) -> GoogleProfile:
    return GoogleProfile(
        **{
            "sub": "google-1",
            "email": email,
            "name": "Alice A.",
            "picture": "https://example.com/a.png",
            "email_verified": True,
            **overrides,
        }
    )


@pytest.fixture
def accounts():
    return FakeAccountRepository()


@pytest.fixture
def issuer():
    return FakeSessionIssuer()


class TestGoogle:
    async def test_an_allowed_address_gets_an_account_and_a_session(
        self, accounts, issuer
    ):
        signed_in = await SignInWithGoogleUseCase(accounts, issuer, ALLOWED).execute(
            SignInWithGoogleCommand(_profile(), user_agent="UA")
        )
        account = signed_in.account
        assert (account.email, account.name, account.picture) == (
            "alice@example.com",
            "Alice A.",
            "https://example.com/a.png",
        )
        assert issuer.issued == [(account.id, "", "UA")]

    async def test_an_address_off_the_list_is_refused_and_nothing_is_made(
        self, accounts, issuer
    ):
        with pytest.raises(NotAllowed):
            await SignInWithGoogleUseCase(accounts, issuer, ALLOWED).execute(
                SignInWithGoogleCommand(_profile("eve@example.com"))
            )
        assert accounts.accounts == {}
        assert issuer.issued == []

    async def test_an_empty_list_lets_nobody_in(self, accounts, issuer):
        with pytest.raises(NotAllowed):
            await SignInWithGoogleUseCase(
                accounts, issuer, AllowList(frozenset())
            ).execute(SignInWithGoogleCommand(_profile()))
        assert accounts.accounts == {}

    async def test_an_imported_account_is_matched_by_email_and_keeps_its_id(
        self, accounts, issuer
    ):
        accounts.add("sso-alice", "alice@example.com", name="Alice")
        signed_in = await SignInWithGoogleUseCase(accounts, issuer, ALLOWED).execute(
            SignInWithGoogleCommand(_profile())
        )
        assert signed_in.account.id == "sso-alice"
        assert signed_in.account.name == "Alice A."  # refreshed from Google
        assert len(accounts.accounts) == 1

    async def test_an_unverified_address_is_refused(self, accounts, issuer):
        with pytest.raises(GoogleSignInFailed):
            await SignInWithGoogleUseCase(accounts, issuer, ALLOWED).execute(
                SignInWithGoogleCommand(_profile(email_verified=False))
            )

    async def test_a_profile_without_an_address_is_refused(self, accounts, issuer):
        with pytest.raises(GoogleSignInFailed):
            await SignInWithGoogleUseCase(accounts, issuer, ALLOWED).execute(
                SignInWithGoogleCommand(_profile(email=""))
            )


class TestDeveloper:
    async def test_signs_an_allowed_address_in(self, accounts, issuer):
        signed_in = await SignInAsDeveloperUseCase(accounts, issuer, ALLOWED).execute(
            SignInAsDeveloperCommand("DEV@example.com")
        )
        assert (signed_in.account.email, signed_in.account.name) == (
            "dev@example.com",
            "Dev",
        )

    async def test_the_allow_list_still_applies(self, accounts, issuer):
        with pytest.raises(NotAllowed):
            await SignInAsDeveloperUseCase(accounts, issuer, ALLOWED).execute(
                SignInAsDeveloperCommand("eve@example.com")
            )
        assert accounts.accounts == {}

    async def test_refuses_a_non_address(self, accounts, issuer):
        with pytest.raises(BadEmail):
            await SignInAsDeveloperUseCase(accounts, issuer, ALLOWED).execute(
                SignInAsDeveloperCommand("dev")
            )


class TestReadAccount:
    async def test_reads_the_account(self, accounts):
        accounts.add("u1", "dev@example.com")
        account = await ReadAccountUseCase(accounts).execute(ReadAccountCommand("u1"))
        assert account.email == "dev@example.com"

    async def test_a_session_for_a_missing_account_is_over(self, accounts):
        with pytest.raises(SessionExpired):
            await ReadAccountUseCase(accounts).execute(ReadAccountCommand("ghost"))
