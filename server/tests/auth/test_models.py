from datetime import UTC, datetime, timedelta

import pytest

from notes.auth.exceptions import BadEmail
from notes.auth.models import REUSE_GRACE, AllowList, Email, RefreshToken

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


class TestAllowList:
    def test_admits_listed_addresses_case_insensitively(self):
        allowed = AllowList(frozenset({"dev@example.com"}))
        assert allowed.admits("dev@example.com")
        assert allowed.admits(" DEV@Example.COM ")

    def test_refuses_everybody_else(self):
        assert not AllowList(frozenset({"dev@example.com"})).admits("eve@example.com")

    def test_an_empty_list_admits_nobody(self):
        assert not AllowList(frozenset()).admits("dev@example.com")


class TestEmail:
    def test_normalizes(self):
        assert Email("  Dev@Example.com ").value == "dev@example.com"

    @pytest.mark.parametrize(
        "raw", ["", "dev", "@example.com", "dev@", "a b@c.d", "x@nodot"]
    )
    def test_refuses_what_is_plainly_not_an_address(self, raw):
        with pytest.raises(BadEmail):
            Email(raw)


class TestRefreshToken:
    def _token(self, **overrides) -> RefreshToken:
        return RefreshToken(
            **{
                "user_id": "u",
                "token_hash": "h",
                "family": "f",
                "expires_at": NOW + timedelta(days=1),
                **overrides,
            }
        )

    def test_dead_when_revoked_or_expired(self):
        assert self._token(revoked_at=NOW).is_dead(NOW)
        assert self._token(expires_at=NOW).is_dead(NOW)
        assert not self._token().is_dead(NOW)

    def test_a_spent_token_is_within_grace_only_briefly(self):
        spent = self._token(used_at=NOW)
        assert spent.within_grace(NOW + REUSE_GRACE)
        assert not spent.within_grace(NOW + REUSE_GRACE + timedelta(seconds=1))

    def test_an_empty_hash_is_refused(self):
        with pytest.raises(ValueError):
            self._token(token_hash="")
