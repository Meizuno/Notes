"""Fixtures for the tests that need a real database, and the whole app.

One pool for the whole run, emptied before each test that asks for it — an
asyncpg pool belongs to the event loop that made it, and
`asyncio_default_*_loop_scope = "session"` in pyproject.toml is what makes one
loop, and so one pool, possible.

There is no SQLite fallback, deliberately: the schema is Postgres's own (an
enum, pg_trgm, gen_random_uuid()), and a test on another engine would test
another schema. Anything testable without a database is tested against the
fakes in tests/fakes.py.

Set TEST_DATABASE_URL to a throwaway database (the dev stack makes
notes_test). Without it the database-backed tests skip rather than fail.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from typing import Any

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from notes.shared.api.dependencies import load_settings
from notes.shared.api.main import create_app
from notes.shared.config import Settings
from notes.shared.database import create_pool
from notes.shared.migrations import migrate
from notes.vault.api.routes import notes as notes_routes

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "")

# Everything a test may write to, truncated together.
_TABLES = ("api_tokens", "refresh_tokens", "users", "notes")

ALLOWED = "dev@example.com,alice@example.com,bob@example.com"
JWT_SECRET = "a-test-secret-of-at-least-32-characters-long"

# Every environment name Settings reads — prefixed, and the bare aliases.
_ENV_NAMES = [f"NOTES_{name.upper()}" for name in Settings.model_fields] + [
    "PORT",
    "CLIENT_DIR",
    "RUN_MIGRATIONS",
    "LOG_LEVEL",
    "LOG_FORMAT",
]


def clear_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Settings reads os.environ and a `.env` in the working directory; a
    developer's own must not decide what a test is about."""
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in _ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(scope="session")
def database_url() -> str:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    return TEST_DATABASE_URL


@pytest.fixture(scope="session")
async def _connection_pool(database_url: str) -> AsyncIterator[asyncpg.Pool]:
    created = await create_pool(database_url)
    await migrate(created)
    yield created
    await created.close()


@pytest.fixture
async def pool(_connection_pool: asyncpg.Pool) -> asyncpg.Pool:
    """The shared pool, with the tables emptied first. Emptied on the way IN,
    which leaves the rows behind for inspection when a test fails."""
    async with _connection_pool.acquire() as connection:
        await connection.execute(
            f"TRUNCATE {', '.join(_TABLES)} RESTART IDENTITY CASCADE"
        )
    return _connection_pool


AppFactory = Callable[..., Awaitable[AsyncClient]]


@pytest.fixture
async def make_client(
    pool: asyncpg.Pool, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AppFactory]:
    """Builds the whole app over ASGI against the test database, with any
    environment a test asks for on top of a working default. Each app runs
    its lifespan, and is shut down when the test ends."""
    running: list[tuple[AsyncClient, asyncio.Event, asyncio.Task[None]]] = []

    async def build(**env: str) -> AsyncClient:
        clear_environment(monkeypatch)
        defaults = {
            "NOTES_DATABASE_URL": TEST_DATABASE_URL,
            "NOTES_JWT_SECRET": JWT_SECRET,
            "NOTES_ALLOWED_EMAILS": ALLOWED,
            "NOTES_DEV_LOGIN": "true",
            "RUN_MIGRATIONS": "false",
        }
        for name, value in {**defaults, **env}.items():
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, value)
        load_settings.cache_clear()
        app = create_app()
        stop = asyncio.Event()
        ready = asyncio.Event()

        async def serve() -> None:
            # The lifespan in a task of its own, entered and left there, as
            # uvicorn runs it: the MCP session manager's task group must be
            # exited by the task that entered it, and pytest-asyncio sets a
            # fixture up and tears it down in different tasks.
            async with app.router.lifespan_context(app):
                ready.set()
                await stop.wait()

        task = asyncio.create_task(serve())
        started = asyncio.create_task(ready.wait())
        await asyncio.wait({task, started}, return_when=asyncio.FIRST_COMPLETED)
        if task.done():
            started.cancel()
            task.result()  # raises what startup raised
        http = AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        )
        running.append((http, stop, task))
        return http

    # The list streams its items with a pause between them; not here.
    monkeypatch.setattr(notes_routes, "ITEM_INTERVAL_SECONDS", 0)
    yield build
    for http, stop, task in reversed(running):
        await http.aclose()
        stop.set()
        await task
    load_settings.cache_clear()


@pytest.fixture
async def client(make_client: AppFactory) -> AsyncClient:
    return await make_client()


async def sign_in(client: AsyncClient, email: str) -> dict[str, Any]:
    """Signs `client` in through the dev sign-in; its cookie jar keeps the
    session. Returns the user."""
    response = await client.get("/api/auth/dev", params={"email": email})
    assert response.status_code == 200, response.text
    user: dict[str, Any] = response.json()["user"]
    return user


async def add_user(pool: asyncpg.Pool, user_id: str, email: str) -> None:
    """An account under a chosen id — what the SSO import leaves behind."""
    await pool.execute(
        "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
        user_id,
        email,
        user_id.capitalize(),
    )


async def add_note(
    pool: asyncpg.Pool,
    *,
    slug: str,
    owner: str = "seed-user",
    title: str | None = None,
    folder: str | None = None,
    content: str = "",
    visibility: str = "PROTECTED",
    is_shared: bool = False,
    is_deleted: bool = False,
    description: str | None = None,
    updated_at: datetime | None = None,
) -> str:
    """A note written straight into the table, as Prisma left them. Returns
    its id."""
    note_id: str = await pool.fetchval(
        """
        INSERT INTO notes (id, slug, user_id, title, folder, content, visibility,
                           is_shared, is_deleted, description, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::note_visibility, $7, $8,
                $9, clock_timestamp() AT TIME ZONE 'UTC',
                COALESCE($10::timestamp, clock_timestamp() AT TIME ZONE 'UTC'))
        RETURNING id::text
        """,
        slug,
        owner,
        title or slug.replace("-", " ").title(),
        folder,
        content,
        visibility,
        is_shared,
        is_deleted,
        description,
        updated_at,
    )
    return note_id
