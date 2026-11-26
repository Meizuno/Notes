from dataclasses import dataclass

from notes.prompts.models import FolderBucket, bucket_by_top_folder
from notes.vault.models import Criteria
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ReadFoldersCommand:
    viewer: str


@dataclass(frozen=True)
class FoldersView:
    folders: list[FolderBucket]
    total: int


class ReadFoldersUseCase:
    """Every visible note in one round trip, bucketed by top-level folder —
    the client pages through the buckets one folder at a time."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ReadFoldersCommand) -> FoldersView:
        page = await self._notes.search(command.viewer, Criteria(limit=None))
        return FoldersView(
            folders=bucket_by_top_folder(page.items), total=len(page.items)
        )
