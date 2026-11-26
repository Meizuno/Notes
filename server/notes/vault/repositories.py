import re
from typing import Final

import asyncpg

from notes.vault.exceptions import SlugTaken
from notes.vault.models import (
    Criteria,
    Note,
    NoteChanges,
    NoteDraft,
    NoteListItem,
    NotePage,
    NoteSummary,
    Visibility,
)

# `id` is a uuid column, and comparing it with a slug that is not a UUID is an
# error in Postgres — so the id branch is only added when the key looks like
# one. A normal slug matches by slug alone.
_UUID: Final = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

# The table is `timestamp(3) without time zone` holding UTC, as Prisma wrote
# it. Said explicitly rather than left to the column default, which would
# follow the session's time zone.
_NOW: Final = "(now() AT TIME ZONE 'UTC')"

_NOTE_COLUMNS: Final = (
    "id::text AS id, slug, title, folder, description, content,"
    " visibility::text AS visibility, is_shared, created_at, updated_at"
)
_LIST_COLUMNS: Final = (
    "id::text AS id, slug, title, folder, content,"
    " visibility::text AS visibility, updated_at"
)
_SUMMARY_COLUMNS: Final = "id::text AS id, slug, title, folder, created_at, updated_at"


class Params:
    """Positional parameters, and the `$n` placeholder for each one added."""

    def __init__(self) -> None:
        self.values: list[object] = []

    def add(self, value: object) -> str:
        self.values.append(value)
        return f"${len(self.values)}"


# ── The WHERE builder ────────────────────────────────────────────────────────
# The visibility rule lives here and nowhere else. Every statement below is
# built from `visible_to`, so HTTP, MCP and the prompts share one filter.


def visible_to(viewer: str | None, params: Params, *, by_link: bool = False) -> str:
    """Which notes a viewer may see.

        anonymous → PUBLIC only
        a user    → PUBLIC + PROTECTED + that user's OWN PRIVATE notes
        by_link   → also any is_shared note (single reads by URL only)

    Soft-deleted notes are nobody's. Another user's PRIVATE note can never
    match: the PRIVATE branch is keyed to the viewer.
    """
    if viewer is None:
        tier = ["visibility = 'PUBLIC'"]
    else:
        tier = [
            "visibility <> 'PRIVATE'",
            f"(visibility = 'PRIVATE' AND user_id = {params.add(viewer)})",
        ]
    if by_link:
        tier.append("is_shared")
    return f"is_deleted = false AND ({' OR '.join(tier)})"


def key_match(key: str, params: Params) -> str:
    """A note by slug, or by slug OR id when the key is a UUID — so friendly
    `/<slug>` URLs and older `/<uuid>` links both resolve."""
    if _UUID.match(key):
        return f"(slug = {params.add(key)} OR id = {params.add(key)}::uuid)"
    return f"slug = {params.add(key)}"


def escape_like(text: str) -> str:
    """Literal text inside a LIKE pattern: `%` and `_` mean themselves, as
    they did in Prisma's `contains` and `startsWith`."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_match(search: str, params: Params) -> str:
    """Title or content, case-insensitively — what the GIN trigram indexes
    are for. Parenthesized, so it can never widen the visibility OR."""
    pattern = params.add(f"%{escape_like(search)}%")
    return f"(title ILIKE {pattern} OR content ILIKE {pattern})"


def folder_match(folder: str, params: Params) -> str:
    """The folder and everything below it — on a path boundary.

    The Nuxt app matched a bare prefix, so "Programming" also took
    "Programming2"; this is the fix the rewrite makes. A trailing slash on
    the filter is ignored ("Programming/" is "Programming").
    """
    folder = folder.rstrip("/") or folder
    exact = params.add(folder)
    below = params.add(f"{escape_like(folder)}/%")
    return f"(folder = {exact} OR folder LIKE {below})"


def criteria_match(viewer: str | None, criteria: Criteria, params: Params) -> str:
    clauses = [visible_to(viewer, params)]
    if criteria.search:
        clauses.append(search_match(criteria.search, params))
    if criteria.folder:
        clauses.append(folder_match(criteria.folder, params))
    return " AND ".join(clauses)


# ── Row mapping ──────────────────────────────────────────────────────────────


def _to_note(row: asyncpg.Record) -> Note:
    return Note(
        id=row["id"],
        slug=row["slug"],
        title=row["title"],
        folder=row["folder"],
        description=row["description"],
        content=row["content"],
        visibility=Visibility(row["visibility"]),
        is_shared=row["is_shared"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _to_item(row: asyncpg.Record) -> NoteListItem:
    return NoteListItem(
        id=row["id"],
        slug=row["slug"],
        title=row["title"],
        folder=row["folder"],
        content=row["content"],
        visibility=Visibility(row["visibility"]),
        updated_at=row["updated_at"],
    )


def _to_summary(row: asyncpg.Record) -> NoteSummary:
    return NoteSummary(
        id=row["id"],
        slug=row["slug"],
        title=row["title"],
        folder=row["folder"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class SqlNoteRepository:
    def __init__(self, connection: asyncpg.Connection) -> None:
        self._connection = connection

    async def search(self, viewer: str | None, criteria: Criteria) -> NotePage:
        params = Params()
        where = criteria_match(viewer, criteria, params)
        total = await self._connection.fetchval(
            f"SELECT count(*) FROM notes WHERE {where}", *params.values
        )
        page = f"OFFSET {params.add(criteria.offset)}"
        if criteria.limit is not None:
            page = f"LIMIT {params.add(criteria.limit)} {page}"
        rows = await self._connection.fetch(
            f"SELECT {_LIST_COLUMNS} FROM notes WHERE {where}"
            f" ORDER BY updated_at DESC, id {page}",
            *params.values,
        )
        return NotePage(items=[_to_item(row) for row in rows], total=int(total))

    async def outline(self, viewer: str | None) -> list[NoteSummary]:
        params = Params()
        rows = await self._connection.fetch(
            f"SELECT {_SUMMARY_COLUMNS} FROM notes WHERE {visible_to(viewer, params)}"
            " ORDER BY created_at, id",
            *params.values,
        )
        return [_to_summary(row) for row in rows]

    async def find(
        self, viewer: str | None, key: str, *, by_link: bool = False
    ) -> Note | None:
        params = Params()
        scope = visible_to(viewer, params, by_link=by_link)
        match = key_match(key, params)
        row = await self._connection.fetchrow(
            f"SELECT {_NOTE_COLUMNS} FROM notes WHERE {scope} AND {match} LIMIT 1",
            *params.values,
        )
        return _to_note(row) if row else None

    async def slug_taken(self, slug: str) -> bool:
        taken: bool = await self._connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM notes WHERE slug = $1)", slug
        )
        return taken

    async def create(self, owner: str, slug: str, draft: NoteDraft) -> Note:
        try:
            row = await self._connection.fetchrow(
                f"""
                INSERT INTO notes (id, slug, user_id, title, folder,
                                   description, content, visibility, is_shared,
                                   created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                        $7::note_visibility, $8, {_NOW}, {_NOW})
                RETURNING {_NOTE_COLUMNS}
                """,
                slug,
                owner,
                draft.title,
                draft.folder,
                draft.description,
                draft.content,
                draft.visibility.value,
                draft.is_shared,
            )
        except asyncpg.UniqueViolationError as taken:
            if taken.constraint_name == "notes_slug_key":
                raise SlugTaken(f"slug {slug} was taken") from taken
            raise
        assert row is not None  # noqa: S101 - RETURNING always yields a row
        return _to_note(row)

    async def update(self, viewer: str, key: str, changes: NoteChanges) -> Note | None:
        params = Params()
        sets = []
        for column, value in changes.written().items():
            if isinstance(value, Visibility):
                sets.append(f"{column} = {params.add(value.value)}::note_visibility")
            else:
                sets.append(f"{column} = {params.add(value)}")
        sets.append(f"updated_at = {_NOW}")
        scope = visible_to(viewer, params)
        # Resolved and written in one statement, with the scope checked again
        # on the row being written: a note soft-deleted between the two halves
        # is not updated.
        row = await self._connection.fetchrow(
            f"""
            UPDATE notes SET {", ".join(sets)}
            WHERE id = (SELECT id FROM notes WHERE {scope} AND {key_match(key, params)}
                        LIMIT 1)
              AND {scope}
            RETURNING {_NOTE_COLUMNS}
            """,
            *params.values,
        )
        return _to_note(row) if row else None

    async def soft_delete(self, viewer: str, key: str) -> bool:
        params = Params()
        deleted = await self._connection.fetchval(
            f"""
            UPDATE notes SET is_deleted = true, updated_at = {_NOW}
            WHERE {visible_to(viewer, params)} AND {key_match(key, params)}
            RETURNING id
            """,
            *params.values,
        )
        return deleted is not None
