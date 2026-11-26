from fastapi import Depends

from notes.prompts.use_cases.read_folders import ReadFoldersUseCase
from notes.prompts.use_cases.read_overview import ReadOverviewUseCase
from notes.vault.api.dependencies import get_note_repo
from notes.vault.ports import NoteRepository


async def get_read_folders_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ReadFoldersUseCase:
    return ReadFoldersUseCase(notes)


async def get_read_overview_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ReadOverviewUseCase:
    return ReadOverviewUseCase(notes)
