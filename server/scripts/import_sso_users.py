"""Bring the central SSO's users across, under the ids they already have.

Run once at the cut-over from the SSO to this app's own sign-in, before
anybody signs in. Every note's `user_id` is an SSO user id; importing the
users under those same ids is what keeps each PRIVATE note with its owner —
no row of `notes` is rewritten. Somebody who first signs in afterwards and
is not in the SSO gets a fresh uuid4, as anybody new does.

    NOTES_DATABASE_URL=postgres://…/notes \\
        python scripts/import_sso_users.py postgres://…/authentication [--dry-run]

It reads `id`, `email`, `name` and `avatar_url` from the SSO's `users` table
and upserts them by id (the address lowercased, an empty name or avatar as
null). It is safe to run again: a user already here is refreshed, not
duplicated. An address that is already here under a DIFFERENT id is reported
and left alone — that is somebody who signed in before the import, and
choosing between the two ids is a decision for a person.

Importing does not let anybody in: sign-in still asks NOTES_ALLOWED_EMAILS.
At the end it lists the owners of PRIVATE notes that still have no account,
which is what to look at before calling the cut-over done.
"""

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg

from notes.auth.models import normalize_email
from notes.shared.database import asyncpg_dsn


@dataclass
class Report:
    imported: list[str] = field(default_factory=list)
    refreshed: list[str] = field(default_factory=list)
    # (sso id, email, the id that address already has here)
    conflicts: list[tuple[str, str, str]] = field(default_factory=list)
    # Owners of PRIVATE notes with no account after the import.
    unowned: list[str] = field(default_factory=list)


class _DryRun(Exception):
    """Raised to roll the import back after reporting what it would do."""


async def import_users(
    source: asyncpg.Connection,
    target: asyncpg.Connection,
    *,
    dry_run: bool = False,
) -> Report:
    """Copy the SSO's users into `users`, in one transaction."""
    rows = await source.fetch(
        "SELECT id::text AS id, email, name, avatar_url FROM users"
        " ORDER BY created_at, id"
    )
    report = Report()
    try:
        async with target.transaction():
            for row in rows:
                await _import_one(target, row, report)
            report.unowned = [
                record["user_id"]
                for record in await target.fetch(
                    """
                    SELECT DISTINCT n.user_id FROM notes n
                    WHERE n.visibility = 'PRIVATE' AND n.is_deleted = false
                      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id)
                    ORDER BY n.user_id
                    """
                )
            ]
            if dry_run:
                raise _DryRun
    except _DryRun:
        pass
    return report


async def _import_one(
    target: asyncpg.Connection, row: asyncpg.Record, report: Report
) -> None:
    sso_id: str = row["id"]
    email = normalize_email(row["email"] or "")
    if not email:
        return
    name = (row["name"] or "").strip() or None
    picture = (row["avatar_url"] or "").strip() or None

    holder = await target.fetchval("SELECT id FROM users WHERE email = $1", email)
    if holder is not None and holder != sso_id:
        report.conflicts.append((sso_id, email, holder))
        return

    existed = await target.fetchval(
        "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)", sso_id
    )
    await target.execute(
        """
        INSERT INTO users (id, email, name, picture) VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
           SET email = EXCLUDED.email,
               name = COALESCE(EXCLUDED.name, users.name),
               picture = COALESCE(EXCLUDED.picture, users.picture)
        """,
        sso_id,
        email,
        name,
        picture,
    )
    (report.refreshed if existed else report.imported).append(email)


async def _run(sso_url: str, notes_url: str, dry_run: bool) -> Report:
    source = await asyncpg.connect(asyncpg_dsn(sso_url))
    try:
        target = await asyncpg.connect(asyncpg_dsn(notes_url))
        try:
            return await import_users(source, target, dry_run=dry_run)
        finally:
            await target.close()
    finally:
        await source.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("sso_database_url", help="the SSO's Postgres URL (read only)")
    parser.add_argument(
        "--dry-run", action="store_true", help="report, and write nothing"
    )
    args = parser.parse_args()
    notes_url = os.environ.get("NOTES_DATABASE_URL", "")
    if not notes_url:
        raise SystemExit("import: NOTES_DATABASE_URL is not set")

    report = asyncio.run(_run(args.sso_database_url, notes_url, args.dry_run))
    verb = "would import" if args.dry_run else "imported"
    print(f"import: {verb} {len(report.imported)}, refreshed {len(report.refreshed)}")
    for sso_id, email, holder in report.conflicts:
        print(f"import: CONFLICT {email}: SSO id {sso_id}, here already as {holder}")
    for owner in report.unowned:
        print(f"import: PRIVATE notes owned by {owner} have no account")
    if report.conflicts:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
