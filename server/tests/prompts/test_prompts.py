"""GET /api/prompts/notes — its four modes, its scope, and who may ask.

The prompt-auth port (test/server/utils/prompt-auth.test.ts) is the scoping
case: a session scopes to its own user, so A cannot read B's PRIVATE note
through the prompt."""

from datetime import datetime

import pytest

from notes.prompts.models import (
    bucket_by_top_folder,
    count_by_top_folder,
    label_order,
    top_folder,
)
from notes.vault.models import NoteListItem, Visibility
from tests.conftest import add_note, add_user, sign_in


def _item(slug: str, folder: str | None) -> NoteListItem:
    return NoteListItem(
        id=slug,
        slug=slug,
        title=slug,
        folder=folder,
        content="",
        visibility=Visibility.PROTECTED,
        updated_at=datetime(2026, 1, 1),
    )


class TestBuckets:
    def test_top_folder(self):
        assert top_folder("Programming/Rust") == "Programming"
        assert top_folder(None) == ""
        assert top_folder("") == ""

    def test_counts_biggest_first_then_alphabetically(self):
        counts = count_by_top_folder(["b/x", "a", None, "b", "a/y", "c", ""])
        assert [(c.label, c.count) for c in counts] == [
            ("", 2),
            ("a", 2),
            ("b", 2),
            ("c", 1),
        ]

    def test_buckets_keep_their_notes_in_order(self):
        buckets = bucket_by_top_folder(
            [_item("1", "P/x"), _item("2", None), _item("3", "P")]
        )
        assert [(b.label, b.count, [n.slug for n in b.notes]) for b in buckets] == [
            ("P", 2, ["1", "3"]),
            ("", 1, ["2"]),
        ]

    def test_labels_sort_as_locale_compare_does(self):
        labels = ["Zeta", "alpha", "Écrits", "beta", "Alpha"]
        assert sorted(labels, key=label_order) == [
            "alpha",
            "Alpha",
            "beta",
            "Écrits",
            "Zeta",
        ]


@pytest.fixture
async def vault(pool):
    await add_user(pool, "alice", "alice@example.com")
    await add_user(pool, "bob", "bob@example.com")
    ids = {
        "rust": await add_note(
            pool,
            slug="rust",
            folder="Programming/Rust",
            content="Ownership and borrowing",
        ),
        "hub": await add_note(pool, slug="hub", folder="Programming", content=""),
        "root": await add_note(pool, slug="root", content="a root note"),
        "bob-secret": await add_note(
            pool, slug="bob-secret", owner="bob", visibility="PRIVATE", folder="Bob"
        ),
    }
    return ids


@pytest.mark.usefixtures("pool")
class TestTheEndpoint:
    async def test_needs_a_caller(self, client):
        response = await client.get("/api/prompts/notes")
        assert response.status_code == 401

    async def test_note_detail(self, client, vault):
        await sign_in(client, "alice@example.com")
        body = (await client.get("/api/prompts/notes", params={"id": "rust"})).json()
        assert body["component"] == "note-detail"
        assert list(body["note"]) == ["id", "title", "content", "folder", "updated_at"]
        assert body["note"]["id"] == vault["rust"]

    async def test_a_session_is_scoped_to_its_own_user(self, client, vault):
        # A cannot read B's PRIVATE note through the prompt.
        await sign_in(client, "alice@example.com")
        response = await client.get("/api/prompts/notes", params={"id": "bob-secret"})
        assert response.status_code == 404
        await sign_in(client, "bob@example.com")
        response = await client.get("/api/prompts/notes", params={"id": "bob-secret"})
        assert response.status_code == 200

    async def test_graph_view_has_no_slugs(self, client, vault):
        await sign_in(client, "alice@example.com")
        body = (await client.get("/api/prompts/notes", params={"view": "graph"})).json()
        assert (body["component"], body["view"]) == ("notes", "graph")
        assert all("slug" not in node for node in body["nodes"])
        assert {"folder:Programming", "folder:Programming/Rust"} <= {
            node["id"] for node in body["nodes"]
        }
        assert all(node["id"] != vault["bob-secret"] for node in body["nodes"])

    async def test_folders_view_buckets_every_visible_note(self, client, vault):
        await sign_in(client, "alice@example.com")
        body = (
            await client.get("/api/prompts/notes", params={"view": "folders"})
        ).json()
        assert (body["component"], body["view"], body["total"]) == (
            "notes",
            "folders",
            3,
        )
        assert [(f["label"], f["count"]) for f in body["folders"]] == [
            ("Programming", 2),
            ("", 1),
        ]
        note = body["folders"][0]["notes"][0]
        assert list(note) == [
            "id",
            "title",
            "folder",
            "snippet",
            "hasContent",
            "updated_at",
        ]

    async def test_list_view_pages_and_keeps_the_chips_whole(self, client, vault):
        await sign_in(client, "alice@example.com")
        body = (
            await client.get(
                "/api/prompts/notes",
                params={"folder": " Programming ", "search": "own", "limit": "1"},
            )
        ).json()
        assert list(body) == [
            "component",
            "folders",
            "notes",
            "total",
            "hasMore",
            "activeFolder",
            "activeSearch",
        ]
        assert body["component"] == "notes"
        assert [(f["label"], f["count"]) for f in body["folders"]] == [
            ("Programming", 2),
            ("", 1),
        ]
        assert [n["id"] for n in body["notes"]] == [vault["rust"]]
        assert body["notes"][0]["snippet"] == "Ownership and borrowing"
        assert body["notes"][0]["hasContent"] is True
        assert (body["total"], body["hasMore"]) == (1, False)
        assert (body["activeFolder"], body["activeSearch"]) == ("Programming", "own")

    @pytest.mark.parametrize(
        ("limit", "expected"), [("abc", 3), ("0", 3), ("2", 2), ("-5", 1), ("1000", 3)]
    )
    async def test_the_limit_is_read_leniently(self, client, vault, limit, expected):
        await sign_in(client, "alice@example.com")
        body = (await client.get("/api/prompts/notes", params={"limit": limit})).json()
        assert len(body["notes"]) == expected

    async def test_an_api_token_works_as_its_owner(self, client, vault):
        await sign_in(client, "bob@example.com")
        raw = (await client.post("/api/tokens", json={"name": "ai-chat"})).json()[
            "token"
        ]
        client.cookies.clear()
        response = await client.get(
            "/api/prompts/notes",
            params={"id": "bob-secret"},
            headers={"Authorization": f"Bearer {raw}"},
        )
        assert response.status_code == 200

    async def test_a_revoked_or_unknown_token_is_401(self, client, vault):
        await sign_in(client, "bob@example.com")
        minted = (await client.post("/api/tokens", json={"name": "x"})).json()
        await client.delete(f"/api/tokens/{minted['pat']['id']}")
        client.cookies.clear()
        for raw in (minted["token"], "notes_pat_nonsense"):
            response = await client.get(
                "/api/prompts/notes", headers={"Authorization": f"Bearer {raw}"}
            )
            assert response.status_code == 401

    async def test_a_token_stops_when_its_owner_leaves_the_allow_list(
        self, make_client, vault
    ):
        client = await make_client()
        await sign_in(client, "bob@example.com")
        raw = (await client.post("/api/tokens", json={"name": "x"})).json()["token"]
        narrower = await make_client(NOTES_ALLOWED_EMAILS="alice@example.com")
        response = await narrower.get(
            "/api/prompts/notes", headers={"Authorization": f"Bearer {raw}"}
        )
        assert response.status_code == 401
