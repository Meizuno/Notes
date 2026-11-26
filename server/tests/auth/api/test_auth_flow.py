"""The session, end to end: cookies, renewal, sign-out, and both doors in."""

import json
from urllib.parse import parse_qs, urlsplit

import pytest

from notes.auth.api.cookies import ACCESS_COOKIE, REFRESH_COOKIE
from notes.auth.google import STATE_COOKIE, GoogleOAuthClient
from notes.auth.models import GoogleProfile
from tests.conftest import add_note, add_user, sign_in

pytestmark = pytest.mark.usefixtures("pool")

GOOGLE = {
    "NOTES_GOOGLE_CLIENT_ID": "client-id",
    "NOTES_GOOGLE_CLIENT_SECRET": "client-secret",
    "NOTES_GOOGLE_REDIRECT_URL": "https://notes.example.com/api/auth/callback",
}


def _cookies(response) -> dict[str, str]:
    """name → the whole Set-Cookie line."""
    return {
        line.split("=", 1)[0]: line for line in response.headers.get_list("set-cookie")
    }


class TestTheCookies:
    async def test_dev_sign_in_sets_the_apps_own_host_only_pair(self, client):
        response = await client.get(
            "/api/auth/dev", params={"email": "dev@example.com"}
        )
        assert response.status_code == 200
        cookies = _cookies(response)
        assert set(cookies) == {ACCESS_COOKIE, REFRESH_COOKIE}
        for line in cookies.values():
            lowered = line.lower()
            assert "httponly" in lowered
            assert "path=/" in lowered
            assert "samesite=lax" in lowered
            # Host-only: never the parent domain the SSO's cookies live on.
            assert "domain=" not in lowered
            # Plain HTTP in development.
            assert "secure" not in lowered
        assert "max-age=900" in cookies[ACCESS_COOKIE].lower()

    async def test_never_the_ssos_names(self, client):
        response = await client.get(
            "/api/auth/dev", params={"email": "dev@example.com"}
        )
        names = set(_cookies(response))
        assert "access_token" not in names
        assert "refresh_token" not in names

    async def test_the_ssos_cookies_are_not_read(self, client):
        await sign_in(client, "dev@example.com")
        access = client.cookies.get(ACCESS_COOKIE)
        client.cookies.clear()
        client.cookies.set("access_token", access)
        assert (await client.get("/api/auth/me")).status_code == 401

    async def test_secure_on_a_deployment(self, make_client):
        client = await make_client(NOTES_SECURE_COOKIES="true")
        response = await client.get(
            "/api/auth/dev", params={"email": "dev@example.com"}
        )
        assert all("secure" in line.lower() for line in _cookies(response).values())


class TestMe:
    async def test_the_nuxt_shape(self, client, pool):
        await add_user(pool, "sso-1", "dev@example.com")
        await sign_in(client, "dev@example.com")
        assert (await client.get("/api/auth/me")).json() == {
            "user": {
                "id": "sso-1",
                "email": "dev@example.com",
                "name": "Sso-1",
                "picture": None,
            }
        }

    async def test_401_without_a_session(self, client):
        assert (await client.get("/api/auth/me")).status_code == 401

    async def test_a_bearer_access_token_works_too(self, client):
        await sign_in(client, "dev@example.com")
        access = client.cookies.get(ACCESS_COOKIE)
        client.cookies.clear()
        response = await client.get(
            "/api/auth/me", headers={"Authorization": f"bearer {access}"}
        )
        assert response.status_code == 200


class TestTheDevSignIn:
    async def test_an_address_off_the_list_is_403_not_allowed_and_nothing_is_made(
        self, client, pool
    ):
        response = await client.get(
            "/api/auth/dev", params={"email": "eve@example.com"}
        )
        assert response.status_code == 403
        assert response.json()["code"] == "not_allowed"
        assert await pool.fetchval("SELECT count(*) FROM users") == 0
        assert "set-cookie" not in response.headers

    async def test_an_empty_allow_list_lets_nobody_in(self, make_client):
        client = await make_client(NOTES_ALLOWED_EMAILS="")
        response = await client.get(
            "/api/auth/dev", params={"email": "dev@example.com"}
        )
        assert response.status_code == 403

    async def test_a_non_address_is_400(self, client):
        response = await client.get("/api/auth/dev", params={"email": "dev"})
        assert response.status_code == 400

    async def test_off_unless_turned_on(self, make_client):
        client = await make_client(NOTES_DEV_LOGIN=None)
        response = await client.get(
            "/api/auth/dev", params={"email": "dev@example.com"}
        )
        assert response.status_code == 404
        assert (await client.get("/api/auth/config")).json() == {
            "google": False,
            "devLogin": False,
        }

    async def test_config_says_when_it_is_on(self, client):
        assert (await client.get("/api/auth/config")).json() == {
            "google": False,
            "devLogin": True,
        }

    async def test_the_same_address_is_the_same_account(self, client, pool):
        first = await sign_in(client, "dev@example.com")
        second = await sign_in(client, "DEV@example.com")
        assert first["id"] == second["id"]
        assert await pool.fetchval("SELECT count(*) FROM users") == 1


class TestRenewal:
    async def test_a_lapsed_access_token_is_renewed_in_passing_even_on_the_stream(
        self, client, pool
    ):
        await add_user(pool, "dev", "dev@example.com")
        await add_note(pool, slug="mine", owner="dev", visibility="PRIVATE")
        await sign_in(client, "dev@example.com")
        old_refresh = client.cookies.get(REFRESH_COOKIE)
        client.cookies.delete(ACCESS_COOKIE)

        response = await client.get("/api/notes")
        lines = [json.loads(line) for line in response.text.split("\n") if line]
        assert lines[0]["meta"]["total"] == 1  # still signed in
        rotated = _cookies(response)
        assert set(rotated) == {ACCESS_COOKIE, REFRESH_COOKIE}
        assert client.cookies.get(REFRESH_COOKIE) != old_refresh

    async def test_refresh_answers_ok_and_rotates(self, client):
        await sign_in(client, "dev@example.com")
        client.cookies.delete(ACCESS_COOKIE)
        response = await client.post("/api/auth/refresh")
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert set(_cookies(response)) == {ACCESS_COOKIE, REFRESH_COOKIE}
        assert (await client.get("/api/auth/me")).status_code == 200

    async def test_refresh_without_a_session_is_401(self, client):
        response = await client.post("/api/auth/refresh")
        assert response.status_code == 401
        # Nothing presented, nothing to clear.
        assert "set-cookie" not in response.headers

    async def test_a_replayed_refresh_token_revokes_the_family(self, client, pool):
        await sign_in(client, "dev@example.com")
        stolen = client.cookies.get(REFRESH_COOKIE)
        client.cookies.delete(ACCESS_COOKIE)
        assert (await client.post("/api/auth/refresh")).status_code == 200
        # Long after the grace window, somebody presents the spent token.
        await pool.execute(
            "UPDATE refresh_tokens SET used_at = now() - interval '1 hour'"
        )
        client.cookies.clear()
        client.cookies.set(REFRESH_COOKIE, stolen)
        response = await client.post("/api/auth/refresh")
        assert response.status_code == 401
        # The dead cookies are dropped, and every token of the family is gone.
        assert set(_cookies(response)) == {ACCESS_COOKIE, REFRESH_COOKIE}
        assert (
            await pool.fetchval(
                "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL"
            )
            == 0
        )

    async def test_concurrent_renewals_inside_the_grace_all_succeed(self, client):
        await sign_in(client, "dev@example.com")
        refresh = client.cookies.get(REFRESH_COOKIE)
        statuses = []
        for _ in range(3):
            client.cookies.clear()
            client.cookies.set(REFRESH_COOKIE, refresh)
            statuses.append((await client.post("/api/auth/refresh")).status_code)
        assert statuses == [200, 200, 200]

    async def test_taking_an_address_off_the_list_ends_the_session_at_renewal(
        self, make_client
    ):
        client = await make_client()
        await sign_in(client, "alice@example.com")
        refresh = client.cookies.get(REFRESH_COOKIE)
        narrower = await make_client(NOTES_ALLOWED_EMAILS="dev@example.com")
        narrower.cookies.set(REFRESH_COOKIE, refresh)
        assert (await narrower.post("/api/auth/refresh")).status_code == 401


class TestLogout:
    async def test_revokes_the_family_and_clears_the_cookies(self, client, pool):
        await sign_in(client, "dev@example.com")
        refresh = client.cookies.get(REFRESH_COOKIE)
        response = await client.post("/api/auth/logout")
        assert response.json() == {"ok": True}
        cleared = _cookies(response)
        assert set(cleared) == {ACCESS_COOKIE, REFRESH_COOKIE}
        assert all("max-age=0" in line.lower() for line in cleared.values())
        assert (
            await pool.fetchval(
                "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL"
            )
            == 0
        )
        client.cookies.clear()
        client.cookies.set(REFRESH_COOKIE, refresh)
        assert (await client.post("/api/auth/refresh")).status_code == 401

    async def test_signing_out_without_a_session_is_still_ok(self, client):
        assert (await client.post("/api/auth/logout")).json() == {"ok": True}


class TestGoogle:
    async def test_start_redirects_to_google_with_a_state_cookie(self, make_client):
        client = await make_client(**GOOGLE)
        response = await client.get("/api/auth/google")
        assert response.status_code == 302
        target = urlsplit(response.headers["location"])
        query = parse_qs(target.query)
        assert target.netloc == "accounts.google.com"
        assert query["redirect_uri"] == [GOOGLE["NOTES_GOOGLE_REDIRECT_URL"]]
        assert query["scope"] == ["openid email profile"]
        state_cookie = _cookies(response)[STATE_COOKIE]
        assert f"{STATE_COOKIE}={query['state'][0]}" in state_cookie
        assert "path=/api/auth" in state_cookie.lower()

    async def test_start_without_google_configured_goes_back_to_login(self, client):
        response = await client.get("/api/auth/google")
        assert response.headers["location"] == "/login?error=auth_failed"
        assert (await client.get("/api/auth/config")).json()["google"] is False

    async def _callback(self, client, monkeypatch, profile: GoogleProfile):
        async def exchange(self, code):
            assert code == "the-code"
            return profile

        monkeypatch.setattr(GoogleOAuthClient, "exchange", exchange)
        client.cookies.set(STATE_COOKIE, "s1", path="/api/auth")
        return await client.get(
            "/api/auth/callback", params={"state": "s1", "code": "the-code"}
        )

    async def test_an_allowed_address_lands_signed_in(
        self, make_client, monkeypatch, pool
    ):
        await add_user(pool, "sso-alice", "alice@example.com")
        client = await make_client(**GOOGLE)
        profile = GoogleProfile(
            sub="g1", email="alice@example.com", name="Alice", email_verified=True
        )
        response = await self._callback(client, monkeypatch, profile)
        assert response.status_code == 302
        assert response.headers["location"] == "/"
        assert {ACCESS_COOKIE, REFRESH_COOKIE} <= set(_cookies(response))
        me = (await client.get("/api/auth/me")).json()["user"]
        assert me["id"] == "sso-alice"  # the imported account, by e-mail

    async def test_an_address_off_the_list_goes_back_with_not_allowed(
        self, make_client, monkeypatch, pool
    ):
        client = await make_client(**GOOGLE)
        profile = GoogleProfile(sub="g2", email="eve@example.com", email_verified=True)
        response = await self._callback(client, monkeypatch, profile)
        assert response.headers["location"] == "/login?error=not_allowed"
        assert ACCESS_COOKIE not in _cookies(response)
        assert await pool.fetchval("SELECT count(*) FROM users") == 0

    async def test_a_mismatched_state_is_auth_failed(self, make_client):
        client = await make_client(**GOOGLE)
        client.cookies.set(STATE_COOKIE, "s1", path="/api/auth")
        response = await client.get(
            "/api/auth/callback", params={"state": "forged", "code": "c"}
        )
        assert response.headers["location"] == "/login?error=auth_failed"

    async def test_an_unverified_address_is_auth_failed(self, make_client, monkeypatch):
        client = await make_client(**GOOGLE)
        profile = GoogleProfile(sub="g3", email="dev@example.com", email_verified=False)
        response = await self._callback(client, monkeypatch, profile)
        assert response.headers["location"] == "/login?error=auth_failed"
