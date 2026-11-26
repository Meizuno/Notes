import re
from pathlib import Path

import asyncpg

from notes.shared.adapters import get_logger

# golang-migrate's layout, as in Forma: NNNNNN_name.up.sql beside its .down.sql.
_UP_FILE = re.compile(r"^(\d+)_.*\.up\.sql$")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"

# One migrator at a time, across every process that shares this database.
# Without it two replicas booting together both read the same version, both
# apply the same files, and the loser leaves the bookkeeping row dirty —
# which then refuses every boot until somebody repairs it by hand. A fixed
# number: it only has to be the same in every copy of this server.
MIGRATION_LOCK = 7311204


class DirtyDatabase(RuntimeError):
    """A previous migration failed halfway and nobody cleaned up after it."""


def pending(directory: Path, current: int) -> list[tuple[int, Path]]:
    """The up-migrations after `current`, in order."""
    found: list[tuple[int, Path]] = []
    for path in sorted(directory.iterdir()):
        match = _UP_FILE.match(path.name)
        if match and int(match.group(1)) > current:
            found.append((int(match.group(1)), path))
    return sorted(found)


async def migrate(pool: asyncpg.Pool, directory: Path = MIGRATIONS_DIR) -> int:
    """Apply the pending up-migrations. Idempotent; returns the new version.

    The bookkeeping is golang-migrate's own `schema_migrations` table, Forma's
    choice. Prisma's `_prisma_migrations` is left exactly as it is: the
    production database was made by Prisma, and 000001 is a baseline written
    to change nothing there (see migrations/000001_notes.up.sql).
    """
    async with pool.acquire() as connection:
        await connection.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK)
        try:
            return await _apply(connection, directory)
        finally:
            # Postgres drops a session lock when the connection dies, so a
            # process killed mid-migration cannot wedge the next boot.
            await connection.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK)


async def _apply(connection: asyncpg.Connection, directory: Path) -> int:
    """The run itself, with the lock already held."""
    logger = get_logger()
    await connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version BIGINT  NOT NULL PRIMARY KEY,
            dirty   BOOLEAN NOT NULL
        )
        """
    )
    row = await connection.fetchrow(
        "SELECT version, dirty FROM schema_migrations LIMIT 1"
    )
    current = int(row["version"]) if row else 0
    if row and row["dirty"]:
        raise DirtyDatabase(
            f"database is dirty at version {current}; fix it by hand before starting"
        )

    waiting = pending(directory, current)
    if not waiting:
        logger.info("migrations_up_to_date", version=current)
        return current

    for version, path in waiting:
        statements = path.read_text(encoding="utf-8")
        # Mark dirty OUTSIDE the transaction that runs the migration, so a
        # crash mid-statement leaves the flag set rather than rolling the
        # warning back along with the work.
        await _record(connection, version, dirty=True)
        async with connection.transaction():
            await connection.execute(statements)
        await _record(connection, version, dirty=False)
        logger.info("migration_applied", version=version, name=path.name)

    return waiting[-1][0]


async def _record(connection: asyncpg.Connection, version: int, *, dirty: bool) -> None:
    await connection.execute("DELETE FROM schema_migrations")
    await connection.execute(
        "INSERT INTO schema_migrations (version, dirty) VALUES ($1, $2)",
        version,
        dirty,
    )
