"""The notes API, end to end — the contract the client and ai-chat rely on."""

import json
import re
from typing import Any

import pytest

from tests.conftest import add_note, add_user, sign_in

pytestmark = pytest.mark.usefixtures("pool")

ISO = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")


def _lines(text: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in text.split("\n") if line]


async def _alice(client: Any, pool: Any) -> None:
    await add_user(pool, "alice", "alice@example.com")
    await sign_in(client, "alice@example.com")


class TestTheList:
    async def test_streams_ndjson_meta_first_then_items(self, client, pool):
        await add_note(
            pool, slug="a", visibility="PUBLIC", content="x" * 130, folder="F"
        )
        await add_note(pool, slug="b", visibility="PUBLIC", content="")
        response = await client.get("/api/notes")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/x-ndjson; charset=utf-8"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-accel-buffering"] == "no"
        assert response.text.endswith("\n")
        lines = _lines(response.text)
        assert lines[0] == {"meta": {"total": 2, "hasMore": False}}
        first, second = (line["item"] for line in lines[1:])
        assert list(first) == ["id", "title", "folder", "updated_at", "snippet"]
        assert first["title"] == "B"  # newest first
        assert first["snippet"] is None
        assert second["snippet"] == "x" * 120 + "…"
        assert ISO.match(second["updated_at"])
        # Compact, as JSON.stringify wrote it.
        assert response.text.startswith('{"meta":{"total":2,"hasMore":false}}\n')

    async def test_anonymous_gets_public_only_and_paging_flags(self, client, pool):
        for n in range(3):
            await add_note(pool, slug=f"p{n}", visibility="PUBLIC")
        await add_note(pool, slug="protected")
        lines = _lines((await client.get("/api/notes", params={"limit": 2})).text)
        assert lines[0] == {"meta": {"total": 3, "hasMore": True}}
        assert len(lines) == 3

    async def test_search_snippet_windows_the_match(self, client, pool):
        await add_note(
            pool, slug="a", visibility="PUBLIC", content="a" * 60 + "Needle" + "b" * 60
        )
        lines = _lines(
            (await client.get("/api/notes", params={"search": " needle "})).text
        )
        assert lines[1]["item"]["snippet"] == "…" + "a" * 40 + "Needle" + "b" * 40 + "…"

    async def test_a_bad_query_is_400(self, client):
        assert (
            await client.get("/api/notes", params={"limit": "500"})
        ).status_code == 400
        assert (
            await client.get("/api/notes", params={"offset": "x"})
        ).status_code == 400

    async def test_a_signed_in_user_sees_their_own_private_notes(self, client, pool):
        await add_note(pool, slug="mine", owner="alice", visibility="PRIVATE")
        await add_note(pool, slug="theirs", owner="bob", visibility="PRIVATE")
        await _alice(client, pool)
        lines = _lines((await client.get("/api/notes")).text)
        assert [line["item"]["title"] for line in lines[1:]] == ["Mine"]


class TestOneNote:
    async def test_reads_by_slug_and_by_uuid_with_the_full_shape(self, client, pool):
        note_id = await add_note(
            pool, slug="hello", visibility="PUBLIC", is_shared=True, description="d"
        )
        body = (await client.get("/api/notes/hello")).json()
        assert list(body) == [
            "id",
            "slug",
            "title",
            "folder",
            "description",
            "content",
            "visibility",
            "is_shared",
            "created_at",
            "updated_at",
        ]
        assert body["id"] == note_id
        assert ISO.match(body["created_at"])
        assert (await client.get(f"/api/notes/{note_id}")).json()["slug"] == "hello"

    async def test_a_shared_note_is_readable_anonymously_by_its_url(self, client, pool):
        await add_note(
            pool, slug="draft", owner="bob", visibility="PRIVATE", is_shared=True
        )
        assert (await client.get("/api/notes/draft")).status_code == 200

    async def test_a_protected_note_is_404_to_anonymous(self, client, pool):
        await add_note(pool, slug="internal")
        assert (await client.get("/api/notes/internal")).status_code == 404


class TestWrites:
    async def test_create_requires_a_session_after_the_body_is_checked(
        self, client, pool
    ):
        # The Nuxt handler validated the body first: a bad body is 400 even
        # anonymously, a good one is 401.
        assert (await client.post("/api/notes", json={})).status_code == 400
        response = await client.post("/api/notes", json={"title": "x"})
        assert response.status_code == 401
        assert await pool.fetchval("SELECT count(*) FROM notes") == 0

    async def test_create_answers_the_note(self, client, pool):
        await _alice(client, pool)
        response = await client.post(
            "/api/notes",
            json={"title": "  My Note ", "folder": "", "visibility": "PUBLIC"},
        )
        assert response.status_code == 200
        body = response.json()
        assert (body["slug"], body["title"], body["folder"], body["is_shared"]) == (
            "my-note",
            "My Note",
            None,
            True,
        )
        owner = await pool.fetchval("SELECT user_id FROM notes WHERE slug = 'my-note'")
        assert owner == "alice"

    async def test_slugs_stay_unique_and_off_the_reserved_routes(self, client, pool):
        await _alice(client, pool)
        first = (await client.post("/api/notes", json={"title": "New"})).json()
        second = (await client.post("/api/notes", json={"title": "New"})).json()
        assert (first["slug"], second["slug"]) == ("new-2", "new-3")

    async def test_update_writes_only_what_was_sent(self, client, pool):
        await add_note(pool, slug="n", folder="F", content="keep", description="d")
        await _alice(client, pool)
        response = await client.put(
            "/api/notes/n", json={"title": " T ", "folder": None}
        )
        assert response.status_code == 200
        body = response.json()
        assert (
            body["title"],
            body["folder"],
            body["content"],
            body["description"],
        ) == (
            "T",
            None,
            "keep",
            "d",
        )

    async def test_update_and_delete_need_a_session(self, client, pool):
        await add_note(pool, slug="n")
        assert (
            await client.put("/api/notes/n", json={"title": "x"})
        ).status_code == 401
        assert (await client.put("/api/notes/n", json={"title": 5})).status_code == 400
        assert (await client.delete("/api/notes/n")).status_code == 401

    async def test_delete_answers_the_key_as_sent(self, client, pool):
        note_id = await add_note(pool, slug="n")
        await _alice(client, pool)
        response = await client.delete(f"/api/notes/{note_id}")
        assert response.json() == {"deleted": note_id}
        assert (await client.delete(f"/api/notes/{note_id}")).status_code == 404

    async def test_another_users_private_note_cannot_be_written(self, client, pool):
        await add_note(pool, slug="bobs", owner="bob", visibility="PRIVATE")
        await _alice(client, pool)
        assert (
            await client.put("/api/notes/bobs", json={"title": "x"})
        ).status_code == 404
        assert (await client.delete("/api/notes/bobs")).status_code == 404


class TestTreeAndGraph:
    async def test_tree_is_oldest_first_and_cheap(self, client, pool):
        await add_note(pool, slug="first", visibility="PUBLIC", folder="F")
        await add_note(pool, slug="second", visibility="PUBLIC")
        body = (await client.get("/api/notes/tree")).json()
        assert [n["slug"] for n in body] == ["first", "second"]
        assert list(body[0]) == ["id", "slug", "title", "folder", "created_at"]

    async def test_graph_nodes_and_edges(self, client, pool):
        note_id = await add_note(pool, slug="n", visibility="PUBLIC", folder="A/B")
        body = (await client.get("/api/graph")).json()
        assert body["nodes"] == [
            {
                "id": "folder:A",
                "title": "A",
                "type": "folder",
                "folder": None,
                "links": 1,
            },
            {
                "id": "folder:A/B",
                "title": "B",
                "type": "folder",
                "folder": "A",
                "links": 2,
            },
            {
                "id": note_id,
                "slug": "n",
                "title": "N",
                "type": "note",
                "folder": "A/B",
                "links": 1,
            },
        ]
        assert body["edges"] == [
            {"source": note_id, "target": "folder:A/B"},
            {"source": "folder:A/B", "target": "folder:A"},
        ]
