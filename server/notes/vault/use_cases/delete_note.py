from dataclasses import dataclass

from notes.vault.exceptions import NoteNotFound
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class DeleteNoteCommand:
    viewer: str
    key: str


class DeleteNoteUseCase:
    """A soft delete: the row stays, marked is_deleted, and disappears from
    every read. Returns the key as given, which is what the caller is told."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: DeleteNoteCommand) -> str:
        if not await self._notes.soft_delete(command.viewer, command.key):
            raise NoteNotFound(command.key)
        return command.key
