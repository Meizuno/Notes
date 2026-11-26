from dataclasses import dataclass

from notes.vault.models import NoteSummary
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ReadTreeCommand:
    viewer: str | None


class ReadTreeUseCase:
    """Every visible note, oldest first, without content — the sidebar tree
    and the form's folder picker."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ReadTreeCommand) -> list[NoteSummary]:
        return await self._notes.outline(command.viewer)
