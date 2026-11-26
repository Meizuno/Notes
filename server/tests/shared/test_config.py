"""Fail-fast configuration — the port of test/server/utils/env.test.ts, plus
what the app's own sign-in added to it."""

import pytest

from notes.shared.config import MIN_SECRET_CHARS, ConfigurationError, Settings
from tests.conftest import clear_environment

DATABASE_URL = "postgresql://user:pass@localhost:5432/notes"
SECRET = "x" * MIN_SECRET_CHARS


@pytest.fixture(autouse=True)
def _an_environment_that_says_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_environment(monkeypatch)


def _settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return Settings()


class TestTheNuxtEnvSchemaCases:
    def test_accepts_a_valid_environment_and_ignores_unrelated_keys(self, monkeypatch):
        settings = _settings(
            monkeypatch,
            NOTES_DATABASE_URL=DATABASE_URL,
            PATH="/usr/bin",
            HOME="/root",
        )
        assert settings.database_url == DATABASE_URL

    def test_rejects_a_missing_database_url(self, monkeypatch):
        with pytest.raises(ConfigurationError, match="NOTES_DATABASE_URL is not set"):
            _settings(monkeypatch)

    def test_rejects_a_database_url_that_is_not_postgres(self, monkeypatch):
        # The old schema's "non-URL auth service" case: the auth service is
        # gone, and the URL that must parse is now the database's.
        with pytest.raises(ConfigurationError, match="does not look like a Postgres"):
            _settings(monkeypatch, NOTES_DATABASE_URL="mysql://x")


class TestTheNamesItReads:
    def test_the_prefixed_settings(self, monkeypatch):
        settings = _settings(
            monkeypatch,
            NOTES_DATABASE_URL=DATABASE_URL,
            NOTES_SITE_URL="https://notes.example.com/",
            NOTES_ALLOWED_EMAILS=" Dev@Example.com , alice@example.com,,",
            NOTES_DEV_LOGIN="true",
        )
        assert settings.origin == "https://notes.example.com"
        assert settings.allowed == frozenset({"dev@example.com", "alice@example.com"})
        assert settings.dev_login_enabled

    def test_port_client_dir_and_migrations_bare_as_the_image_sets_them(
        self, monkeypatch
    ):
        settings = _settings(
            monkeypatch,
            NOTES_DATABASE_URL=DATABASE_URL,
            NOTES_JWT_SECRET=SECRET,
            PORT="8080",
            CLIENT_DIR="/app/dist",
            RUN_MIGRATIONS="false",
        )
        assert settings.port == 8080
        assert settings.client_dir == "/app/dist"
        assert settings.run_migrations is False
        # A client directory is the sign of a deployment.
        assert settings.cookies_are_secure
        assert settings.logs_as_json

    def test_an_empty_allow_list_admits_nobody(self, monkeypatch):
        assert _settings(monkeypatch, NOTES_DATABASE_URL=DATABASE_URL).allowed == set()


class TestRefusingToStart:
    def test_lists_every_problem_at_once(self, monkeypatch):
        with pytest.raises(ConfigurationError) as refused:
            _settings(
                monkeypatch,
                CLIENT_DIR="/app/dist",
                NOTES_GOOGLE_CLIENT_ID="id",
                NOTES_DEV_LOGIN="true",
                NOTES_SITE_URL="notes.example.com",
                NOTES_ALLOWED_EMAILS="dev@example.com,alice",
            )
        message = str(refused.value)
        for expected in (
            "NOTES_DATABASE_URL is not set",
            "NOTES_JWT_SECRET must be at least",
            "Google sign-in is half configured",
            "NOTES_DEV_LOGIN is on and CLIENT_DIR is set",
            "NOTES_SITE_URL",
            "not addresses: alice",
        ):
            assert expected in message

    def test_a_laptop_without_a_secret_gets_a_generated_one(self, monkeypatch):
        settings = _settings(monkeypatch, NOTES_DATABASE_URL=DATABASE_URL)
        assert settings.jwt_secret_was_generated
        assert len(settings.jwt_secret) >= MIN_SECRET_CHARS

    def test_the_dev_sign_in_is_never_on_with_a_client_dir(self, monkeypatch):
        settings = Settings(
            database_url=DATABASE_URL,
            jwt_secret=SECRET,
            dev_login=True,
        )
        assert settings.dev_login_enabled
        assert not settings.model_copy(update={"client_dir": "/x"}).dev_login_enabled

    def test_google_is_all_three_or_none(self, monkeypatch):
        settings = _settings(
            monkeypatch,
            NOTES_DATABASE_URL=DATABASE_URL,
            NOTES_GOOGLE_CLIENT_ID="id",
            NOTES_GOOGLE_CLIENT_SECRET="secret",
            NOTES_GOOGLE_REDIRECT_URL="https://notes.example.com/api/auth/callback",
        )
        assert settings.google_configured
