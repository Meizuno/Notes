from typing import Protocol

from notes.vault.models import (
    Criteria,
    Note,
    NoteChanges,
    NoteDraft,
    NotePage,
    NoteSummary,
)


class NoteRepository(Protocol):
    """Every read and write of a note, each within a viewer's scope.

    `viewer` is the signed-in user's id, or None for an anonymous caller. The
    visibility rule — anonymous sees PUBLIC; a user sees PUBLIC, PROTECTED and
    their OWN PRIVATE notes; soft-deleted notes are nobody's — is applied by
    every method here and written once, in the implementation's WHERE
    builder. HTTP, MCP and the prompts all come through this port, so a new
    caller cannot forget it.
    """

    async def search(self, viewer: str | None, criteria: Criteria) -> NotePage:
        """Newest-updated first, with the total for pagination. A search
        matches title or content, case-insensitively; a folder takes itself
        and everything below it, never a sibling that shares a prefix."""

    async def outline(self, viewer: str | None) -> list[NoteSummary]:
        """Every visible note, oldest first, without content."""

    async def find(
        self, viewer: str | None, key: str, *, by_link: bool = False
    ) -> Note | None:
        """By slug, or by id when the key is a UUID (legacy links).

        `by_link` widens the scope to any `is_shared` note — readable by
        whoever holds its URL, anonymous included. Only single-note reads by
        URL pass it; listings and every write keep the tier scope, so a
        shared note is never listed and a stranger with the link cannot edit.
        """

    async def slug_taken(self, slug: str) -> bool:
        """Across every row, soft-deleted ones included: the index is."""

    async def create(self, owner: str, slug: str, draft: NoteDraft) -> Note:
        """Raises SlugTaken when a concurrent create took the slug first."""

    async def update(self, viewer: str, key: str, changes: NoteChanges) -> Note | None:
        """Within the viewer's scope, in one statement; None when nothing in
        scope matched. Sets updated_at, whatever else it writes."""

    async def soft_delete(self, viewer: str, key: str) -> bool:
        """Marks it deleted within the viewer's scope; whether anything was."""
