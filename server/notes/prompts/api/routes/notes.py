import math

from fastapi import APIRouter, Depends, Request, Response

from notes.auth.api.security import get_caller
from notes.prompts.api.dependencies import (
    get_read_folders_use_case,
    get_read_overview_use_case,
)
from notes.prompts.api.schemas import (
    FoldersPromptResponse,
    GraphPromptResponse,
    NoteDetailResponse,
    OverviewPromptResponse,
)
from notes.prompts.use_cases.read_folders import ReadFoldersCommand, ReadFoldersUseCase
from notes.prompts.use_cases.read_overview import (
    ReadOverviewCommand,
    ReadOverviewUseCase,
)
from notes.shared.text import js_number, trim
from notes.vault.api.dependencies import get_read_graph_use_case, get_read_note_use_case
from notes.vault.models import Criteria
from notes.vault.use_cases.read_graph import ReadGraphCommand, ReadGraphUseCase
from notes.vault.use_cases.read_note import ReadNoteCommand, ReadNoteUseCase

router = APIRouter(prefix="/prompts", tags=["prompts"])

DEFAULT_LIMIT = 10
MAX_LIMIT = 100


@router.get("/notes", response_model=None)
async def notes_prompt(
    request: Request,
    viewer: str = Depends(get_caller),
    read_note: ReadNoteUseCase = Depends(get_read_note_use_case),
    read_graph: ReadGraphUseCase = Depends(get_read_graph_use_case),
    read_folders: ReadFoldersUseCase = Depends(get_read_folders_use_case),
    read_overview: ReadOverviewUseCase = Depends(get_read_overview_use_case),
) -> Response:
    """ai-chat's "Notes overview" prompt, in four modes:

    - `?id=<key>` — one note's full content (`component: note-detail`);
    - `?view=graph` — the folder-tree graph, nodes without slugs;
    - `?view=folders` — every note, bucketed by top-level folder;
    - otherwise — a page (`folder`, `search`, `limit` ≤ 100, default 10,
      `offset`) plus the folder chips.

    Scoped to the caller — an API token's owner or the session's user — so
    another user's PRIVATE note is a 404 here as everywhere. The query is
    read the way the Nuxt handler read it: by hand, leniently, never a 400.
    """
    query = request.query_params
    note_id = query.get("id") or ""
    view = query.get("view") or ""
    folder = trim(query.get("folder") or "")
    search = trim(query.get("search") or "")
    limit = _number(query.get("limit"), DEFAULT_LIMIT)
    offset = _number(query.get("offset"), 0)
    # Nuxt handed these straight to Prisma; a negative or fractional value
    # was a 500 or a reversed page there. Here they are clamped.
    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))

    if note_id:
        note = await read_note.execute(ReadNoteCommand(viewer=viewer, key=note_id))
        return _json(NoteDetailResponse.from_domain(note))

    if view == "graph":
        graph = await read_graph.execute(ReadGraphCommand(viewer))
        return _json(GraphPromptResponse.from_domain(graph))

    if view == "folders":
        folders = await read_folders.execute(ReadFoldersCommand(viewer))
        return _json(FoldersPromptResponse.from_domain(folders))

    overview = await read_overview.execute(
        ReadOverviewCommand(
            viewer=viewer,
            criteria=Criteria(search=search, folder=folder, limit=limit, offset=offset),
        )
    )
    return _json(
        OverviewPromptResponse.from_domain(
            overview, folder=folder, search=search, offset=offset
        )
    )


def _number(raw: str | None, fallback: int) -> float:
    """`Number(raw) || fallback`: NaN and 0 both fall back."""
    value = js_number(raw)
    if math.isnan(value) or value == 0:
        return fallback
    if math.isinf(value):
        return MAX_LIMIT if value > 0 else 0
    return value


def _json(
    model: FoldersPromptResponse
    | GraphPromptResponse
    | NoteDetailResponse
    | OverviewPromptResponse,
) -> Response:
    return Response(content=model.model_dump_json(), media_type="application/json")
