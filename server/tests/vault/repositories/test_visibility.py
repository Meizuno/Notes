"""The visibility rule, as Postgres reads it.

The WHERE builder's text is asserted in tests/vault/test_where.py; this is
what it means against real rows — the guarantees every reader relies on.
"""

from datetime import datetime, timedelta

import asyncpg
import pytest

from notes.vault.exceptions import SlugTaken
from notes.vault.models import Criteria, Visibility, changes_from, draft_from
from notes.vault.repositories import SqlNoteRepository
from tests.conftest import add_note

pytestmark = pytest.mark.usefixtures("pool")


@pytest.fixture
async def connection(pool: asyncpg.Pool):
    async with pool.acquire() as connection:
        yield connection


@pytest.fixture
def notes(connection) -> SqlNoteRepository:
    return SqlNoteRepository(connection)


@pytest.fixture
async def vault(pool: asyncpg.Pool) -> dict[str, str]:
    """One note of every kind, by slug → id."""
    return {
        "public": await add_note(
            pool, slug="public", visibility="PUBLIC", is_shared=True
        ),
        "protected": await add_note(pool, slug="protected"),
        "alice-private": await add_note(
            pool, slug="alice-private", owner="alice", visibility="PRIVATE"
        ),
        "bob-private": await add_note(
            pool, slug="bob-private", owner="bob", visibility="PRIVATE"
        ),
        "bob-shared": await add_note(
            pool, slug="bob-shared", owner="bob", visibility="PRIVATE", is_shared=True
        ),
        "deleted": await add_note(
            pool, slug="deleted", visibility="PUBLIC", is_deleted=True
        ),
    }


async def _listed(
    notes: SqlNoteRepository, viewer: str | None, **criteria
) -> list[str]:
    page = await notes.search(viewer, Criteria(limit=100, **criteria))
    return sorted(item.slug for item in page.items)


class TestWhoSeesWhat:
    async def test_anonymous_sees_public_only(self, notes, vault):
        assert await _listed(notes, None) == ["public"]
        assert [n.slug for n in await notes.outline(None)] == ["public"]

    async def test_a_user_sees_public_protected_and_their_own_private_only(
        self, notes, vault
    ):
        assert await _listed(notes, "alice") == ["alice-private", "protected", "public"]
        assert await _listed(notes, "bob") == [
            "bob-private",
            "bob-shared",
            "protected",
            "public",
        ]

    async def test_a_shared_note_is_readable_by_its_key_but_never_listed(
        self, notes, vault
    ):
        assert await notes.find(None, "bob-shared", by_link=True) is not None
        assert await notes.find("alice", "bob-shared", by_link=True) is not None
        # Not without the link scope (MCP, prompts), and not in any listing.
        assert await notes.find("alice", "bob-shared") is None
        assert "bob-shared" not in await _listed(notes, "alice")
        assert "bob-shared" not in [n.slug for n in await notes.outline(None)]

    async def test_another_users_private_note_is_not_found_by_key(self, notes, vault):
        assert await notes.find("alice", "bob-private") is None
        assert await notes.find("alice", "bob-private", by_link=True) is None
        assert await notes.find("bob", "bob-private") is not None

    async def test_a_deleted_note_is_nobodys(self, notes, vault):
        assert await notes.find(None, "deleted", by_link=True) is None
        assert "deleted" not in await _listed(notes, "alice")

    async def test_a_uuid_key_finds_the_note_too(self, notes, vault):
        found = await notes.find(None, vault["public"])
        assert found is not None
        assert found.slug == "public"


class TestSearch:
    async def test_a_search_never_reaches_another_users_private_note(self, pool, notes):
        await add_note(
            pool,
            slug="mine",
            owner="alice",
            visibility="PRIVATE",
            content="secret plan",
        )
        await add_note(
            pool,
            slug="theirs",
            owner="bob",
            visibility="PRIVATE",
            content="secret plan",
        )
        await add_note(pool, slug="shared", content="the secret is out")
        assert await _listed(notes, "alice", search="secret") == ["mine", "shared"]
        assert await _listed(notes, None, search="secret") == []

    async def test_matches_title_or_content_case_insensitively(self, pool, notes):
        await add_note(pool, slug="a", title="Vue tips")
        await add_note(pool, slug="b", content="all about VUE")
        await add_note(pool, slug="c", content="react")
        assert await _listed(notes, "u", search="vue") == ["a", "b"]

    async def test_wildcards_are_literal(self, pool, notes):
        await add_note(pool, slug="a", content="100% sure")
        await add_note(pool, slug="b", content="1000 sure")
        assert await _listed(notes, "u", search="100%") == ["a"]
        assert await _listed(notes, "u", search="_") == []

    async def test_pagination_and_total(self, pool, notes):
        for n in range(5):
            await add_note(pool, slug=f"n{n}", updated_at=datetime(2026, 1, 1, 0, 0, n))
        page = await notes.search("u", Criteria(limit=2, offset=1))
        assert page.total == 5
        assert [item.slug for item in page.items] == ["n3", "n2"]


class TestFolderFilter:
    async def test_takes_the_folder_and_below_but_not_a_sibling_sharing_a_prefix(
        self, pool, notes
    ):
        await add_note(pool, slug="hub", folder="Programming")
        await add_note(pool, slug="rust", folder="Programming/Rust")
        await add_note(pool, slug="deep", folder="Programming/Rust/Async")
        await add_note(pool, slug="other", folder="Programming2")
        await add_note(pool, slug="root")
        assert await _listed(notes, "u", folder="Programming") == [
            "deep",
            "hub",
            "rust",
        ]
        assert await _listed(notes, "u", folder="Programming/") == [
            "deep",
            "hub",
            "rust",
        ]
        assert await _listed(notes, "u", folder="Programming/Rust") == ["deep", "rust"]

    async def test_an_underscore_in_a_folder_is_not_a_wildcard(self, pool, notes):
        await add_note(pool, slug="a", folder="a_b/x")
        await add_note(pool, slug="b", folder="aXb/x")
        assert await _listed(notes, "u", folder="a_b") == ["a"]


class TestWrites:
    async def test_create_writes_utc_timestamps_and_returns_the_row(
        self, connection, notes
    ):
        before = await connection.fetchval("SELECT now() AT TIME ZONE 'UTC'")
        note = await notes.create("alice", "hello", draft_from(title="Hello"))
        assert note.slug == "hello"
        assert note.created_at == note.updated_at
        assert note.created_at - before < timedelta(seconds=5)
        owner = await connection.fetchval(
            "SELECT user_id FROM notes WHERE id = $1::uuid", note.id
        )
        assert owner == "alice"

    async def test_a_taken_slug_is_reported_as_such(self, pool, notes):
        await add_note(pool, slug="hello", is_deleted=True)
        assert await notes.slug_taken("hello")
        with pytest.raises(SlugTaken):
            await notes.create("alice", "hello", draft_from(title="Hello"))

    async def test_update_sets_updated_at_and_only_the_given_fields(self, pool, notes):
        await add_note(
            pool,
            slug="n",
            folder="F",
            content="keep",
            updated_at=datetime(2020, 1, 1),
        )
        updated = await notes.update("u", "n", changes_from(title="New", folder=None))
        assert updated is not None
        assert (updated.title, updated.folder, updated.content) == ("New", None, "keep")
        assert updated.updated_at > datetime(2025, 1, 1)
        assert updated.slug == "n"  # a rename keeps the slug

    async def test_update_of_visibility_to_public_shares_it(self, pool, notes):
        await add_note(pool, slug="n")
        updated = await notes.update(
            "u", "n", changes_from(visibility=Visibility.PUBLIC)
        )
        assert updated is not None
        assert (updated.visibility, updated.is_shared) == (Visibility.PUBLIC, True)

    async def test_an_empty_update_still_touches_updated_at(self, pool, notes):
        await add_note(pool, slug="n", updated_at=datetime(2020, 1, 1))
        updated = await notes.update("u", "n", changes_from())
        assert updated is not None
        assert updated.updated_at > datetime(2025, 1, 1)

    async def test_update_and_delete_stay_within_scope(self, pool, notes):
        await add_note(pool, slug="theirs", owner="bob", visibility="PRIVATE")
        await add_note(
            pool, slug="by-link", owner="bob", visibility="PRIVATE", is_shared=True
        )
        assert await notes.update("alice", "theirs", changes_from(title="x")) is None
        assert await notes.update("alice", "by-link", changes_from(title="x")) is None
        assert not await notes.soft_delete("alice", "theirs")
        assert await notes.update("bob", "theirs", changes_from(title="x")) is not None

    async def test_soft_delete_keeps_the_row_and_hides_it(
        self, pool, connection, notes
    ):
        note_id = await add_note(pool, slug="n", updated_at=datetime(2020, 1, 1))
        assert await notes.soft_delete("u", "n")
        row = await connection.fetchrow(
            "SELECT is_deleted, updated_at FROM notes WHERE id = $1::uuid", note_id
        )
        assert row["is_deleted"] is True
        assert row["updated_at"] > datetime(2025, 1, 1)
        assert await notes.find("u", "n") is None
        assert not await notes.soft_delete("u", "n")  # already deleted
