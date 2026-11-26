from dataclasses import dataclass

from notes.vault.exceptions import NoteNotFound
from notes.vault.models import Note
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ReadNoteCommand:
    viewer: str | None
    key: str
    # The note page reads by URL, which also opens is_shared notes; MCP and
    # the prompts keep the tier scope only.
    by_link: bool = False


class ReadNoteUseCase:
    """One note by slug or UUID. A note the viewer may not see is
    indistinguishable from one that does not exist."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ReadNoteCommand) -> Note:
        note = await self._notes.find(
            command.viewer, command.key, by_link=command.by_link
        )
        if note is None:
            raise NoteNotFound(command.key)
        return note
