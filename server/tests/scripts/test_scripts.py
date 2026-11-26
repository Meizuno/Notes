"""The operator scripts: the SSO import at cut-over, and the dev seed."""

import uuid

import asyncpg
import pytest
import seed
from import_sso_users import import_users

from tests.conftest import TEST_DATABASE_URL, add_note, add_user, sign_in

pytestmark = pytest.mark.usefixtures("pool")

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())


@pytest.fixture
async def sso(pool: asyncpg.Pool):
    """The SSO's users table, as its migrations made it, in a schema of its
    own; a connection that sees it as `users`."""
    await pool.execute(
        """
        DROP SCHEMA IF EXISTS sso_fixture CASCADE;
        CREATE SCHEMA sso_fixture;
        CREATE TABLE sso_fixture.users (
            id         UUID PRIMARY KEY,
            email      VARCHAR(255) NOT NULL UNIQUE,
            name       VARCHAR(255) NOT NULL DEFAULT '',
            avatar_url TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    await pool.execute(
        "INSERT INTO sso_fixture.users (id, email, name, avatar_url) VALUES"
        " ($1, 'Alice@Example.com', 'Alice', 'https://example.com/a.png'),"
        " ($2, 'bob@example.com', '', '')",
        uuid.UUID(ALICE),
        uuid.UUID(BOB),
    )
    connection = await asyncpg.connect(
        TEST_DATABASE_URL, server_settings={"search_path": "sso_fixture"}
    )
    yield connection
    await connection.close()
    await pool.execute("DROP SCHEMA sso_fixture CASCADE")


@pytest.fixture
async def target(pool: asyncpg.Pool):
    async with pool.acquire() as connection:
        yield connection


class TestImportSsoUsers:
    async def test_imports_users_under_their_sso_ids(self, sso, target, pool):
        report = await import_users(sso, target)
        assert sorted(report.imported) == ["alice@example.com", "bob@example.com"]
        rows = await pool.fetch(
            "SELECT id, email, name, picture FROM users ORDER BY email"
        )
        assert [tuple(r) for r in rows] == [
            (ALICE, "alice@example.com", "Alice", "https://example.com/a.png"),
            (BOB, "bob@example.com", None, None),
        ]

    async def test_private_notes_keep_their_owner(self, sso, target, pool, client):
        await add_note(pool, slug="alice-plans", owner=ALICE, visibility="PRIVATE")
        await import_users(sso, target)
        await sign_in(client, "alice@example.com")
        assert (await client.get("/api/notes/alice-plans")).status_code == 200

    async def test_running_it_again_refreshes_rather_than_duplicates(
        self, sso, target, pool
    ):
        await import_users(sso, target)
        report = await import_users(sso, target)
        assert report.imported == []
        assert sorted(report.refreshed) == ["alice@example.com", "bob@example.com"]
        assert await pool.fetchval("SELECT count(*) FROM users") == 2

    async def test_an_address_already_here_under_another_id_is_left_alone(
        self, sso, target, pool
    ):
        await add_user(pool, "signed-in-early", "bob@example.com")
        report = await import_users(sso, target)
        assert report.conflicts == [(BOB, "bob@example.com", "signed-in-early")]
        assert (
            await pool.fetchval("SELECT id FROM users WHERE email = 'bob@example.com'")
            == "signed-in-early"
        )

    async def test_a_dry_run_writes_nothing(self, sso, target, pool):
        report = await import_users(sso, target, dry_run=True)
        assert len(report.imported) == 2
        assert await pool.fetchval("SELECT count(*) FROM users") == 0

    async def test_reports_private_notes_still_without_an_owner(
        self, sso, target, pool
    ):
        await add_note(pool, slug="orphan", owner="ghost", visibility="PRIVATE")
        await add_note(pool, slug="fine", owner=ALICE, visibility="PRIVATE")
        report = await import_users(sso, target)
        assert report.unowned == ["ghost"]


class TestSeed:
    async def test_writes_the_fifteen_notes_with_their_slugs(self, pool):
        assert await seed.seed(TEST_DATABASE_URL) == 15
        rows = await pool.fetch(
            "SELECT slug, title, folder, visibility::text, is_shared, user_id"
            " FROM notes ORDER BY created_at"
        )
        assert [r["slug"] for r in rows] == [
            "index",
            "notes-app",
            "programming",
            "type-script",
            "java-script",
            "vue",
            "nuxt",
            "markdown",
            "prisma",
            "books-to-read",
            "designing-data-intensive-applications",
            "the-pragmatic-programmer",
            "daily-notes",
            "productivity",
            "ideas",
        ]
        assert {(r["visibility"], r["is_shared"], r["user_id"]) for r in rows} == {
            ("PROTECTED", False, "seed-user")
        }
        assert rows[3]["folder"] == "Programming/Languages"

    async def test_running_it_again_replaces_the_seed_and_nothing_else(self, pool):
        await add_note(pool, slug="someone-elses", owner="alice")
        await seed.seed(TEST_DATABASE_URL)
        await seed.seed(TEST_DATABASE_URL)
        assert (
            await pool.fetchval(
                "SELECT count(*) FROM notes WHERE user_id = 'seed-user'"
            )
            == 15
        )
        assert await pool.fetchval("SELECT count(*) FROM notes") == 16

    def test_refuses_anything_but_a_development_database(self):
        seed._development_only("postgresql://notes:notes@localhost:5432/notes")
        seed._development_only("postgresql://notes:notes@pg:5432/notes")
        with pytest.raises(SystemExit):
            seed._development_only("postgres://u:p@postgres.prod.example:5432/notes")
