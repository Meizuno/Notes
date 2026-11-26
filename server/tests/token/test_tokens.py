"""Personal API tokens: minted once, stored hashed, revocable, and good for
/api/mcp and /api/prompts/notes only."""

from datetime import timedelta

import pytest

from notes.shared.adapters import hash_token
from notes.token.exceptions import InvalidTokenRequest
from notes.token.models import API_TOKEN_PREFIX
from notes.token.repositories import TokenPrincipals
from notes.token.use_cases.create_token import CreateTokenCommand, CreateTokenUseCase
from notes.token.use_cases.list_tokens import ListTokensCommand, ListTokensUseCase
from notes.token.use_cases.revoke_token import RevokeTokenCommand, RevokeTokenUseCase
from tests.conftest import add_note, add_user, sign_in
from tests.fakes import FakeClock, FakeRandomTokens, FakeTokenRepository


class TestUseCases:
    async def test_mints_a_prefixed_secret_and_stores_only_its_hash(self):
        tokens = FakeTokenRepository()
        minted = await CreateTokenUseCase(tokens, FakeRandomTokens()).execute(
            CreateTokenCommand(user_id="u1", name="  ai-chat  ")
        )
        assert minted.raw == f"{API_TOKEN_PREFIX}random-1"
        assert minted.token.name == "ai-chat"
        stored_token, stored_hash = tokens.tokens[0]
        assert stored_hash == hash_token(minted.raw)
        assert minted.raw not in repr(stored_token)

    @pytest.mark.parametrize("name", ["", "   ", "x" * 101])
    async def test_a_token_needs_a_sensible_name(self, name):
        with pytest.raises(InvalidTokenRequest):
            await CreateTokenUseCase(FakeTokenRepository(), FakeRandomTokens()).execute(
                CreateTokenCommand(user_id="u1", name=name)
            )

    async def test_lists_only_the_owners_live_tokens_and_revokes_quietly(self):
        tokens = FakeTokenRepository()
        create = CreateTokenUseCase(tokens, FakeRandomTokens())
        mine = await create.execute(CreateTokenCommand(user_id="u1", name="a"))
        await create.execute(CreateTokenCommand(user_id="u2", name="b"))
        await RevokeTokenUseCase(tokens).execute(
            RevokeTokenCommand("u2", mine.token.id)
        )
        assert [
            t.name
            for t in await ListTokensUseCase(tokens).execute(ListTokensCommand("u1"))
        ] == ["a"]
        await RevokeTokenUseCase(tokens).execute(
            RevokeTokenCommand("u1", mine.token.id)
        )
        await RevokeTokenUseCase(tokens).execute(
            RevokeTokenCommand("u1", mine.token.id)
        )
        assert await ListTokensUseCase(tokens).execute(ListTokensCommand("u1")) == []

    async def test_principals_resolve_live_tokens_only(self):
        clock = FakeClock()
        tokens = FakeTokenRepository(clock)
        tokens.emails["u1"] = "dev@example.com"
        create = CreateTokenUseCase(tokens, FakeRandomTokens())
        live = await create.execute(CreateTokenCommand(user_id="u1", name="a"))
        expiring = await create.execute(
            CreateTokenCommand(
                user_id="u1", name="b", expires_at=clock.now() + timedelta(hours=1)
            )
        )
        principals = TokenPrincipals(tokens)
        assert await principals.resolve(live.raw) == ("u1", "dev@example.com")
        assert await principals.resolve("eyJ.a.session.jwt") is None
        clock.advance(timedelta(hours=2))
        assert await principals.resolve(expiring.raw) is None


@pytest.mark.usefixtures("pool")
class TestTheApi:
    async def test_create_list_and_revoke_in_forma_shapes(self, client):
        await sign_in(client, "dev@example.com")
        created = await client.post("/api/tokens", json={"name": "ai-chat"})
        assert created.status_code == 200
        body = created.json()
        assert body["token"].startswith(API_TOKEN_PREFIX)
        assert list(body["pat"]) == [
            "id",
            "name",
            "createdAt",
            "lastUsedAt",
            "expiresAt",
        ]
        assert body["pat"]["name"] == "ai-chat"

        listed = (await client.get("/api/tokens")).json()
        assert listed == {"pats": [body["pat"]]}

        left = (await client.delete(f"/api/tokens/{body['pat']['id']}")).json()
        assert left == {"pats": []}

    async def test_the_secret_is_stored_hashed(self, client, pool):
        await sign_in(client, "dev@example.com")
        raw = (await client.post("/api/tokens", json={"name": "x"})).json()["token"]
        stored = await pool.fetchval("SELECT token_hash FROM api_tokens")
        assert stored == hash_token(raw)

    async def test_an_expiry_is_kept_and_a_blank_name_refused(self, client):
        await sign_in(client, "dev@example.com")
        body = (
            await client.post(
                "/api/tokens", json={"name": "x", "expiresAt": "2030-01-01T00:00:00Z"}
            )
        ).json()
        assert body["pat"]["expiresAt"] == "2030-01-01T00:00:00.000Z"
        assert (await client.post("/api/tokens", json={"name": " "})).status_code == 400

    async def test_tokens_need_a_session_and_a_token_cannot_manage_tokens(self, client):
        assert (await client.get("/api/tokens")).status_code == 401
        await sign_in(client, "dev@example.com")
        raw = (await client.post("/api/tokens", json={"name": "x"})).json()["token"]
        client.cookies.clear()
        bearer = {"Authorization": f"Bearer {raw}"}
        assert (await client.get("/api/tokens", headers=bearer)).status_code == 401
        assert (
            await client.post("/api/tokens", json={"name": "more"}, headers=bearer)
        ).status_code == 401

    async def test_a_token_is_not_a_session_on_the_rest_of_the_api(self, client, pool):
        await add_user(pool, "dev", "dev@example.com")
        await add_note(pool, slug="mine", owner="dev", visibility="PRIVATE")
        await sign_in(client, "dev@example.com")
        raw = (await client.post("/api/tokens", json={"name": "x"})).json()["token"]
        client.cookies.clear()
        bearer = {"Authorization": f"Bearer {raw}"}
        assert (await client.get("/api/notes/mine", headers=bearer)).status_code == 404
        assert (
            await client.post("/api/notes", json={"title": "t"}, headers=bearer)
        ).status_code == 401
