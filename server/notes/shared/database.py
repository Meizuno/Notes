from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

from notes.shared.exceptions import Overloaded

# Parameters that belong to Prisma and mean nothing to asyncpg — which passes
# an unknown query parameter on to Postgres as a server setting, where it
# fails the connection. Dropped rather than rejected, so the URL the Nuxt app
# was deployed with keeps working.
_PRISMA_ONLY_PARAMS = frozenset(
    {
        "schema",
        "connection_limit",
        "pool_timeout",
        "pgbouncer",
        "socket_timeout",
        "statement_cache_size",
        "connect_timeout",
        "sslaccept",
    }
)


def asyncpg_dsn(url: str) -> str:
    """Rewrite a Prisma-flavoured DATABASE_URL into one asyncpg accepts."""
    parts = urlsplit(url)
    kept = [(k, v) for k, v in parse_qsl(parts.query) if k not in _PRISMA_ONLY_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


async def _keep_as_is(connection: asyncpg.Connection) -> None:
    """Replaces asyncpg's reset query when a connection goes back to the pool.

    The default sends `pg_advisory_unlock_all(); CLOSE ALL; UNLISTEN *; RESET
    ALL;` on every release — a round trip per request to undo four things this
    server never does on a request path. The one advisory lock in the server,
    the migration runner's, releases itself in a finally.
    """


# How many connections one process keeps. The Postgres behind production is
# shared by every app on the host, and this one is small.
POOL_SIZE = 10

# How long a request waits for a free connection before it is told no. Past
# it the caller gets a 503 instead of a hang with nothing in the log.
ACQUIRE_TIMEOUT = 5.0


async def create_pool(database_url: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
        asyncpg_dsn(database_url),
        min_size=1,
        max_size=POOL_SIZE,
        reset=_keep_as_is,
    )
    if pool is None:  # pragma: no cover - asyncpg only returns None on misuse
        raise RuntimeError("could not create a connection pool")
    return pool


async def acquire(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    """One pooled connection for the length of a request.

    Deliberately NOT wrapped in a transaction, as in Forma: the session gate
    can rotate the refresh cookie mid-request, and if that write rolled back
    with a failing handler, the browser would hold a token that no longer
    exists. Every write here is a single statement anyway.
    """
    async with borrowed(pool) as connection:
        yield connection


@asynccontextmanager
async def borrowed(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    """One connection, waited for only so long."""
    try:
        async with pool.acquire(timeout=ACQUIRE_TIMEOUT) as connection:
            yield connection
    except TimeoutError as waited_too_long:
        # asyncpg raises a bare, message-less TimeoutError. On its own that
        # reaches the client as a 500, which says the server is broken when it
        # is merely full.
        raise Overloaded(
            "the server is busy right now — try again in a moment"
        ) from waited_too_long
