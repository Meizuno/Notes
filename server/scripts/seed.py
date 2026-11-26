"""A small vault to look at, for development.

LOCAL DEV ONLY: it refuses to run against anything that is not plainly a
development database.

The same fifteen notes prisma/seed.ts made — grouped by folder (Programming/,
Reading/, Productivity/, plus two root-level notes), all PROTECTED, owned by
"seed-user". Plain markdown: references between notes are just words.

    NOTES_DATABASE_URL=postgresql://notes:notes@localhost:5432/notes \\
        python scripts/seed.py

Run it again to start over: it deletes the previous seed's notes first, as
the Prisma seed did, and leaves everybody else's alone. Slugs come from the
same rules a note created in the app gets, so they read like real ones.
"""

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

# The image keeps exactly one copy of the package, at /app/notes, and running
# a script puts the SCRIPT's directory on the path rather than the working
# one — so the package is found from here.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from notes.shared.database import create_pool
from notes.vault.repositories import SqlNoteRepository
from notes.vault.use_cases.create_note import CreateNoteCommand, CreateNoteUseCase

USER_ID = "seed-user"


@dataclass(frozen=True)
class Seed:
    title: str
    content: str
    folder: str | None = None
    description: str | None = None


NOTES: list[Seed] = [
    Seed(
        title="Index",
        description="Landing page with links to the main hubs in the vault.",
        content="""# Index

Landing page for the vault. Hubs:

- Programming — language and framework notes
- Books to Read — current reading queue
- Daily Notes — journaling
- Notes App — meta notes about this app""",
    ),
    Seed(
        title="Notes App",
        description="Meta notes about this app — goals, architecture, current status.",
        content="""# Notes App

This app. A self-hosted vault built on Nuxt + Vue + Prisma.

## Goals
- Markdown notes, grouped by folder.
- Graph view at `/`.
- Shared workspace — any authed user can edit anything.

## Status
- CRUD: working
- Graph: folder topology""",
    ),
    Seed(
        title="Programming",
        folder="Programming",
        description="Hub linking to every technical note in the vault — languages, frameworks, tooling.",
        content="""# Programming

Hub for technical notes.

## Languages
- TypeScript — primary
- JavaScript — fundamentals

## Frameworks
- Vue — UI framework
- Nuxt — full-stack on top of Vue

## Tooling
- Markdown — note format
- Prisma — ORM""",
    ),
    Seed(
        title="TypeScript",
        folder="Programming/Languages",
        description="Statically-typed superset of JavaScript. Patterns I reach for and open questions about type design.",
        content="""# TypeScript

Statically-typed superset of JavaScript. Pairs especially well with Vue 3 — the `<script setup lang="ts">` flow gives full inference for props, refs, and `defineModel`.

## What I reach for
- `as const` for literal-narrowing
- discriminated unions for finite state machines
- `satisfies` to validate without widening

## Open question
- worth using `zod` schemas as the source of truth and inferring TS types from them?""",
    ),
    Seed(
        title="JavaScript",
        folder="Programming/Languages",
        description="Language quirks and idioms worth keeping in muscle memory.",
        content="""# JavaScript

The runtime under TypeScript. Notes on language quirks worth keeping in muscle memory:

- `Object.fromEntries` + `Object.entries` for map/transform pipelines.
- `structuredClone` deep-copies most things (not functions, not DOM nodes).
- `Array.prototype.at(-1)` for last element.

See also Markdown for fenced code rendering quirks.""",
    ),
    Seed(
        title="Vue",
        folder="Programming/Frameworks",
        description="Reactive UI framework notes — Composition API, defineModel, TypeScript integration.",
        content="""# Vue

Reactive UI framework. Notes here are mostly about Composition API + `<script setup>`.

- TypeScript integration is excellent.
- For server-rendered apps, Nuxt is the default choice.
- `defineModel` removes most v-model boilerplate.

Related: Notes App is built on Vue + Nuxt.""",
    ),
    Seed(
        title="Nuxt",
        folder="Programming/Frameworks",
        description="Full-stack Vue framework — SSR, file-based routing, Nitro server, auto-imports.",
        content="""# Nuxt

Full-stack Vue framework. SSR, file-based routing, Nitro server, auto-imports.

## What I use it for
- Notes App (this app)
- Recipe Book (shared-workspace recipe vault)

## Patterns I keep coming back to
- Server components for cacheable rendered fragments.
- NDJSON streaming endpoints for progressive rendering.
- `useState` to persist cross-navigation list state.""",
    ),
    Seed(
        title="Markdown",
        folder="Programming/Tools",
        description="Plain-text formatting used for every note in this vault. CommonMark + GFM conventions.",
        content="""# Markdown

Plain-text formatting language. Used as the canonical content format in this vault.

- Lists prefer `-` markers (CommonMark + GFM).
- Headings are ATX (`#` style).
- Code fences use triple backticks with a language tag.""",
    ),
    Seed(
        title="Prisma",
        folder="Programming/Tools",
        description="TypeScript-first ORM for PostgreSQL. Schema-first workflow and migration cadence.",
        content="""# Prisma

TypeScript-first ORM for PostgreSQL (and others). Notes:

- Schema-first: `schema.prisma` is the source of truth, generated types follow.
- Use `select` over `include` to avoid over-fetching.
- Migrations: `prisma migrate dev` for dev, `prisma migrate deploy` in prod.

Used by Notes App for the Note table.""",
    ),
    Seed(
        title="Books to Read",
        folder="Reading",
        description="Current reading queue with one-line notes on why each book is interesting.",
        content="""# Books to Read

Currently queued:

- Designing Data-Intensive Applications — distributed systems primer
- The Pragmatic Programmer — re-read
- Atomic Habits — behaviour design

Add more from Daily Notes when I jot something down.""",
    ),
    Seed(
        title="Designing Data-Intensive Applications",
        folder="Reading/Books",
        description="Kleppmann's backend engineering primer — replication, partitioning, transactions, consensus, batch vs stream.",
        content="""# Designing Data-Intensive Applications

By Martin Kleppmann. The book everyone recommends for backend engineers.

## Topics covered
- Replication, partitioning, transactions
- Consensus, ordering, batch vs stream
- Real examples drawn from production systems

Cross-links to Programming when reading the chapters on distributed databases — e.g., why Prisma's default isolation levels matter.""",
    ),
    Seed(
        title="The Pragmatic Programmer",
        folder="Reading/Books",
        description="20th anniversary edition. Themes that still hold up: DRY, tracer bullets, plain text.",
        content="""# The Pragmatic Programmer

Andy Hunt + Dave Thomas. The 20th anniversary edition holds up.

Themes I keep returning to:
- DRY — but not pre-emptively. Three similar lines beats a premature abstraction.
- Tracer bullets — get an end-to-end working slice before optimising any single piece.
- Plain text rules. Hence: Markdown over rich-text editors.

See also: Productivity notes.""",
    ),
    Seed(
        title="Daily Notes",
        folder="Productivity",
        description="Free-form journaling. One note per day, top section is the day's shipping list.",
        content="""# Daily Notes

Free-form journaling. Each entry tagged with a date and linked from here.

## Pattern
- One note per day, title `YYYY-MM-DD`.
- Top section: three things to ship today.
- Middle: scratchpad.
- Bottom: links to anything I want to revisit, e.g. Books to Read or Ideas.

This note is the index — individual day-notes link back here.""",
    ),
    Seed(
        title="Productivity",
        folder="Productivity",
        description="Techniques that actually stick — time-boxing, paper triage, hard task first.",
        content="""# Productivity

Loose collection of techniques that actually stick.

- Time-boxing > to-do lists.
- One physical notebook for triage; digital for archive.
- The first 30 minutes of the day go to the hardest task.

Inspirations from The Pragmatic Programmer and (eventually) Atomic Habits.""",
    ),
    Seed(
        title="Ideas",
        folder="Productivity",
        description="Raw idea park — promote each item to a proper note once it grows legs.",
        content="""# Ideas

Park ideas here, promote to a proper note when they grow legs.

- A graph view that animates new links as they appear (matches the Notes App streaming aesthetic).
- A "weekly review" that surfaces orphan notes — anything in the vault with no inbound or outbound links.
- A keyboard-only quick-switcher (Ctrl+P) over note titles, with fuzzy-match.""",
    ),
]


def _development_only(url: str) -> None:
    """Refuses anything that does not look like somebody's own machine. A
    production database is the one place this must never reach."""
    host = url.split("@")[-1].split("/")[0]
    if not any(
        host.startswith(local)
        for local in ("localhost", "127.0.0.1", "pg:", "postgres:", "db:")
    ):
        raise SystemExit(f"seed: {host} is not a development database")


async def seed(url: str) -> int:
    """Replace the seed's notes; how many were written."""
    pool = await create_pool(url)
    try:
        async with pool.acquire() as connection:
            await connection.execute("DELETE FROM notes WHERE user_id = $1", USER_ID)
            create = CreateNoteUseCase(SqlNoteRepository(connection))
            for note in NOTES:
                await create.execute(
                    CreateNoteCommand(
                        owner=USER_ID,
                        title=note.title,
                        content=note.content,
                        folder=note.folder,
                        description=note.description,
                    )
                )
    finally:
        await pool.close()
    return len(NOTES)


def main() -> None:
    url = os.environ.get("NOTES_DATABASE_URL", "")
    if not url:
        raise SystemExit("seed: NOTES_DATABASE_URL is not set")
    _development_only(url)
    print("seed: clearing previous seed data")
    written = asyncio.run(seed(url))
    print(f"seed: done — {written} notes")


if __name__ == "__main__":
    main()
