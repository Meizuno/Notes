from dataclasses import dataclass

from notes.vault.models import NoteSummary
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ListPagesCommand:
    viewer: str | None


class ListPagesUseCase:
    """The notes the sitemap lists for this viewer, newest-updated first.

    Anonymous (a crawler) gets the PUBLIC ones; a signed-in user every note
    they may read. Shared-by-link notes are never listed.
    """

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ListPagesCommand) -> list[NoteSummary]:
        notes = await self._notes.outline(command.viewer)
        return sorted(notes, key=lambda note: note.updated_at, reverse=True)
