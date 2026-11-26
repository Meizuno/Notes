from dataclasses import dataclass

from notes.vault.models import Note
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class FindPublishedNoteCommand:
    key: str


class FindPublishedNoteUseCase:
    """A note anybody may read by its URL — PUBLIC, or shared by link — or
    None. What a page carries for crawlers and link previews: the same for
    every visitor, so it never depends on who is asking."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: FindPublishedNoteCommand) -> Note | None:
        return await self._notes.find(None, command.key, by_link=True)
