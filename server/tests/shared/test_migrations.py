"""The migrations: idempotent, safe to race, and — the one that matters most —
000001 is a no-op on the database Prisma made.

tests/fixtures/prisma/ holds the six migration files the Nuxt app's Prisma
applied to production, verbatim. Replaying them builds that database here,
and the baseline must leave it exactly as it was, rows included.
"""

import asyncio
from pathlib import Path

import asyncpg
import pytest

from notes.shared.migrations import MIGRATIONS_DIR, migrate

pytestmark = pytest.mark.usefixtures("pool")

PRISMA = Path(__file__).resolve().parents[1] / "fixtures" / "prisma"

# `\d+ notes` of the production copy, as information_schema reads it.
EXPECTED_COLUMNS = [
    ("id", "uuid", None, None, "NO", None),
    ("user_id", "text", None, None, "NO", None),
    ("title", "character varying", 300, None, "NO", None),
    ("folder", "character varying", 500, None, "YES", None),
    ("content", "text", None, None, "NO", "''::text"),
    ("is_deleted", "boolean", None, None, "NO", "false"),
    ("created_at", "timestamp without time zone", None, 3, "NO", "CURRENT_TIMESTAMP"),
    ("updated_at", "timestamp without time zone", None, 3, "NO", "CURRENT_TIMESTAMP"),
    ("visibility", "USER-DEFINED", None, None, "NO", "'PROTECTED'::note_visibility"),
    ("description", "character varying", 500, None, "YES", None),
    ("is_shared", "boolean", None, None, "NO", "false"),
    ("slug", "character varying", 120, None, "NO", None),
]


def _index(name: str, method: str, column: str, *, unique: bool = False) -> str:
    kind = "UNIQUE INDEX" if unique else "INDEX"
    return f"CREATE {kind} {name} ON public.notes USING {method} ({column})"


EXPECTED_INDEXES = {
    "notes_pkey": _index("notes_pkey", "btree", "id", unique=True),
    "notes_content_idx": _index("notes_content_idx", "gin", "content gin_trgm_ops"),
    "notes_folder_idx": _index("notes_folder_idx", "btree", "folder"),
    "notes_is_deleted_idx": _index("notes_is_deleted_idx", "btree", "is_deleted"),
    "notes_slug_key": _index("notes_slug_key", "btree", "slug", unique=True),
    "notes_title_idx": _index("notes_title_idx", "gin", "title gin_trgm_ops"),
    "notes_user_id_idx": _index("notes_user_id_idx", "btree", "user_id"),
    "notes_visibility_idx": _index("notes_visibility_idx", "btree", "visibility"),
}


async def _columns(pool: asyncpg.Pool) -> list[tuple[object, ...]]:
    rows = await pool.fetch(
        """
        SELECT column_name, data_type, character_maximum_length, datetime_precision,
               is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notes'
        ORDER BY ordinal_position
        """
    )
    return [
        (
            r["column_name"],
            r["data_type"],
            r["character_maximum_length"],
            r["datetime_precision"] if r["data_type"].startswith("timestamp") else None,
            r["is_nullable"],
            r["column_default"],
        )
        for r in rows
    ]


async def _indexes(pool: asyncpg.Pool) -> dict[str, str]:
    rows = await pool.fetch(
        "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'notes'"
    )
    return {
        r["indexname"]: r["indexdef"].replace("public.gin_trgm_ops", "gin_trgm_ops")
        for r in rows
    }


async def _catalog(pool: asyncpg.Pool) -> tuple[object, ...]:
    enum = await pool.fetchval(
        """
        SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'note_visibility'
        """
    )
    extension = await pool.fetchval(
        "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'"
    )
    return await _columns(pool), await _indexes(pool), enum, extension


async def _fresh_schema(pool: asyncpg.Pool) -> None:
    await pool.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    # Cached statements on the pooled connections name types that just went.
    await pool.expire_connections()


class TestTheBaseline:
    async def test_builds_exactly_the_prisma_table(self, pool):
        columns, indexes, enum, extension = await _catalog(pool)
        assert columns == EXPECTED_COLUMNS
        assert indexes == EXPECTED_INDEXES
        assert enum == "PRIVATE,PROTECTED,PUBLIC"
        assert extension == 1

    async def test_changes_nothing_on_the_database_prisma_made(self, pool):
        await _fresh_schema(pool)
        for path in sorted(PRISMA.glob("*.sql")):
            await pool.execute(path.read_text(encoding="utf-8"))
        await pool.execute(
            "CREATE TABLE _prisma_migrations (id text PRIMARY KEY, migration_name text)"
        )
        await pool.execute(
            "INSERT INTO _prisma_migrations VALUES ('1', '20260515111224_init')"
        )
        await pool.execute(
            """
            INSERT INTO notes (id, slug, user_id, title, content, visibility, is_shared)
            VALUES (gen_random_uuid(), 'a', 'sso-1', 'A', 'body', 'PRIVATE', false),
                   (gen_random_uuid(), 'b', 'sso-2', 'B', '', 'PUBLIC', true)
            """
        )
        before = await _catalog(pool)
        rows_before = await pool.fetch("SELECT * FROM notes ORDER BY slug")

        assert await migrate(pool, MIGRATIONS_DIR) == 2

        assert await _catalog(pool) == before
        assert await pool.fetch("SELECT * FROM notes ORDER BY slug") == rows_before
        # Prisma's bookkeeping is left exactly where it was.
        assert await pool.fetchval("SELECT count(*) FROM _prisma_migrations") == 1
        # And the app's own tables are there beside it.
        assert await pool.fetchval("SELECT count(*) FROM users") == 0
        # The Prisma-made table is what the baseline would have made.
        assert before[0] == EXPECTED_COLUMNS
        assert before[1] == EXPECTED_INDEXES

    async def test_running_it_twice_by_hand_is_harmless(self, pool):
        sql = (MIGRATIONS_DIR / "000001_notes.up.sql").read_text(encoding="utf-8")
        before = await _catalog(pool)
        await pool.execute(sql)
        assert await _catalog(pool) == before


class TestTheRunner:
    async def test_running_it_again_changes_nothing(self, pool):
        before = await pool.fetchval("SELECT version FROM schema_migrations")
        assert await migrate(pool, MIGRATIONS_DIR) == before == 2
        assert not await pool.fetchval("SELECT dirty FROM schema_migrations")

    async def test_two_migrators_at_once_do_not_collide(self, pool):
        await _fresh_schema(pool)
        results = await asyncio.gather(
            *(migrate(pool, MIGRATIONS_DIR) for _ in range(3))
        )
        assert results == [2, 2, 2]
        assert not await pool.fetchval("SELECT dirty FROM schema_migrations")
        assert await pool.fetchval("SELECT count(*) FROM notes") == 0

    async def test_the_lock_is_let_go_afterwards(self, pool):
        await migrate(pool, MIGRATIONS_DIR)
        held = await pool.fetchval(
            "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'"
        )
        assert held == 0

    async def test_the_baseline_has_no_way_down(self, pool):
        sql = (MIGRATIONS_DIR / "000001_notes.down.sql").read_text(encoding="utf-8")
        with pytest.raises(asyncpg.RaiseError, match="refusing to drop"):
            await pool.execute(sql)
        assert await pool.fetchval("SELECT to_regclass('notes') IS NOT NULL")
