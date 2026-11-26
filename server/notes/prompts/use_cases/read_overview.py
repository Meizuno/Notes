from dataclasses import dataclass

from notes.prompts.models import FolderCount, count_by_top_folder
from notes.vault.models import Criteria, NotePage
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ReadOverviewCommand:
    viewer: str
    criteria: Criteria


@dataclass(frozen=True)
class Overview:
    folders: list[FolderCount]
    page: NotePage


class ReadOverviewUseCase:
    """A page of notes plus the folder chips.

    The chips count across the whole visible vault rather than the filtered
    page, so they stay put while the person filters.
    """

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ReadOverviewCommand) -> Overview:
        everything = await self._notes.outline(command.viewer)
        page = await self._notes.search(command.viewer, command.criteria)
        return Overview(
            folders=count_by_top_folder(note.folder for note in everything),
            page=page,
        )
