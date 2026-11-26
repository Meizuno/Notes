import asyncpg
from fastapi import Depends

from notes.shared.api.dependencies import get_connection
from notes.vault.ports import NoteRepository
from notes.vault.repositories import SqlNoteRepository
from notes.vault.use_cases.create_note import CreateNoteUseCase
from notes.vault.use_cases.delete_note import DeleteNoteUseCase
from notes.vault.use_cases.find_published_note import FindPublishedNoteUseCase
from notes.vault.use_cases.list_notes import ListNotesUseCase
from notes.vault.use_cases.list_pages import ListPagesUseCase
from notes.vault.use_cases.read_graph import ReadGraphUseCase
from notes.vault.use_cases.read_note import ReadNoteUseCase
from notes.vault.use_cases.read_tree import ReadTreeUseCase
from notes.vault.use_cases.update_note import UpdateNoteUseCase


async def get_note_repo(
    connection: asyncpg.Connection = Depends(get_connection),
) -> NoteRepository:
    return SqlNoteRepository(connection)


async def get_list_notes_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ListNotesUseCase:
    return ListNotesUseCase(notes)


async def get_read_note_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ReadNoteUseCase:
    return ReadNoteUseCase(notes)


async def get_create_note_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> CreateNoteUseCase:
    return CreateNoteUseCase(notes)


async def get_update_note_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> UpdateNoteUseCase:
    return UpdateNoteUseCase(notes)


async def get_delete_note_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> DeleteNoteUseCase:
    return DeleteNoteUseCase(notes)


async def get_read_tree_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ReadTreeUseCase:
    return ReadTreeUseCase(notes)


async def get_read_graph_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ReadGraphUseCase:
    return ReadGraphUseCase(notes)


async def get_find_published_note_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> FindPublishedNoteUseCase:
    return FindPublishedNoteUseCase(notes)


async def get_list_pages_use_case(
    notes: NoteRepository = Depends(get_note_repo),
) -> ListPagesUseCase:
    return ListPagesUseCase(notes)
