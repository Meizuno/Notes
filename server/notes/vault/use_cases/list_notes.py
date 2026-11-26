from dataclasses import dataclass

from notes.vault.models import Criteria, NotePage
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ListNotesCommand:
    viewer: str | None
    criteria: Criteria


class ListNotesUseCase:
    """A page of the notes this viewer may see, newest-updated first.

    Readable anonymously (PUBLIC only). The search is applied INSIDE the
    visibility scope, never beside it — an authed search once leaked other
    users' PRIVATE notes in the Nuxt app's history.
    """

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ListNotesCommand) -> NotePage:
        return await self._notes.search(command.viewer, command.criteria)
