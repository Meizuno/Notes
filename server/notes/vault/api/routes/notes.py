import asyncio
from collections.abc import AsyncIterator
from typing import Annotated

import orjson
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from notes.auth.api.security import get_viewer, signed_in
from notes.shared.text import iso
from notes.vault.api.dependencies import (
    get_create_note_use_case,
    get_delete_note_use_case,
    get_list_notes_use_case,
    get_read_note_use_case,
    get_read_tree_use_case,
    get_update_note_use_case,
)
from notes.vault.api.schemas import (
    DeletedResponse,
    ListNotesQuery,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    TreeEntryResponse,
    visibility_of,
)
from notes.vault.models import Criteria, NotePage, Visibility, make_snippet
from notes.vault.use_cases.create_note import CreateNoteCommand, CreateNoteUseCase
from notes.vault.use_cases.delete_note import DeleteNoteCommand, DeleteNoteUseCase
from notes.vault.use_cases.list_notes import ListNotesCommand, ListNotesUseCase
from notes.vault.use_cases.read_note import ReadNoteCommand, ReadNoteUseCase
from notes.vault.use_cases.read_tree import ReadTreeCommand, ReadTreeUseCase
from notes.vault.use_cases.update_note import UpdateNoteCommand, UpdateNoteUseCase

router = APIRouter(prefix="/notes", tags=["notes"])

# Deliberate pacing between items, so the client sees cards cascade in rather
# than twenty landing in the same frame. The Nuxt stream's, kept.
ITEM_INTERVAL_SECONDS = 0.03

NDJSON_HEADERS = {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
}


@router.get("")
async def list_notes(
    query: Annotated[ListNotesQuery, Query()],
    viewer: str | None = Depends(get_viewer),
    list_notes: ListNotesUseCase = Depends(get_list_notes_use_case),
) -> StreamingResponse:
    """The note list, streamed as NDJSON:

        {"meta":{"total":N,"hasMore":bool}}
        {"item":{"id","title","folder","updated_at","snippet"}}
        …

    Meta first, so the client can settle its loading state and pagination
    before cards begin; items newest-updated first. Anonymous callers get
    PUBLIC notes only.
    """
    page = await list_notes.execute(
        ListNotesCommand(
            viewer=viewer,
            criteria=Criteria(
                search=query.search,
                folder=query.folder,
                limit=query.limit,
                offset=query.offset,
            ),
        )
    )
    return StreamingResponse(
        _ndjson(page, offset=query.offset, search=query.search),
        headers=NDJSON_HEADERS,
    )


async def _ndjson(page: NotePage, *, offset: int, search: str) -> AsyncIterator[bytes]:
    meta = {"total": page.total, "hasMore": offset + len(page.items) < page.total}
    yield orjson.dumps({"meta": meta}) + b"\n"
    await asyncio.sleep(0)
    for note in page.items:
        item = {
            "id": note.id,
            "title": note.title,
            "folder": note.folder,
            "updated_at": iso(note.updated_at),
            "snippet": make_snippet(note.content, search),
        }
        yield orjson.dumps({"item": item}) + b"\n"
        await asyncio.sleep(ITEM_INTERVAL_SECONDS)


@router.post("")
async def create_note(
    body: NoteCreate,
    viewer: str | None = Depends(get_viewer),
    create: CreateNoteUseCase = Depends(get_create_note_use_case),
) -> NoteResponse:
    """Creates a note owned by the caller. The body is checked before the
    session, as the Nuxt handler did: a bad body is 400 even anonymously."""
    note = await create.execute(
        CreateNoteCommand(
            owner=signed_in(viewer),
            title=body.title,
            content=body.content,
            folder=body.folder,
            description=body.description,
            visibility=Visibility(body.visibility),
            is_shared=body.is_shared,
        )
    )
    return NoteResponse.from_domain(note)


# Declared before /{key}, which would otherwise take "tree" as a slug.
@router.get("/tree")
async def read_tree(
    viewer: str | None = Depends(get_viewer),
    read_tree: ReadTreeUseCase = Depends(get_read_tree_use_case),
) -> list[TreeEntryResponse]:
    """Every visible note, oldest first: {id, slug, title, folder, created_at}."""
    notes = await read_tree.execute(ReadTreeCommand(viewer))
    return [TreeEntryResponse.from_domain(note) for note in notes]


@router.get("/{key}")
async def read_note(
    key: str,
    viewer: str | None = Depends(get_viewer),
    read: ReadNoteUseCase = Depends(get_read_note_use_case),
) -> NoteResponse:
    """By slug or UUID. No session needed: anonymous callers see PUBLIC notes
    and any note shared by link; anything else is 404, exactly as a missing
    one is."""
    note = await read.execute(ReadNoteCommand(viewer=viewer, key=key, by_link=True))
    return NoteResponse.from_domain(note)


@router.put("/{key}")
async def update_note(
    key: str,
    body: NoteUpdate,
    viewer: str | None = Depends(get_viewer),
    update: UpdateNoteUseCase = Depends(get_update_note_use_case),
) -> NoteResponse:
    note = await update.execute(
        UpdateNoteCommand(
            viewer=signed_in(viewer),
            key=key,
            title=body.given("title"),
            content=body.given("content"),
            folder=body.given("folder"),
            description=body.given("description"),
            visibility=visibility_of(body.given("visibility")),
            is_shared=body.given("is_shared"),
        )
    )
    return NoteResponse.from_domain(note)


@router.delete("/{key}")
async def delete_note(
    key: str,
    viewer: str | None = Depends(get_viewer),
    delete: DeleteNoteUseCase = Depends(get_delete_note_use_case),
) -> DeletedResponse:
    deleted = await delete.execute(DeleteNoteCommand(viewer=signed_in(viewer), key=key))
    return DeletedResponse(deleted=deleted)
