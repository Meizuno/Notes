"""The MCP tools ai-chat reads and writes the vault with.

Same five tools as the Nuxt app's server/utils/mcp/notes.ts — names,
descriptions, parameters and result JSON — and the input schemas spelled as
the Node SDK published them (zod-to-json-schema, draft-07), so a client sees
the same tools/list it always has.

Every tool calls a vault use case, never a repository: whatever the HTTP API
refuses, a tool refuses for the same reason. The user is the caller the
endpoint resolved — an API token's owner, or a session's user — and is the
creator stamp on create and the boundary that keeps other users' PRIVATE
notes out of reach.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, ClassVar, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    ValidationError,
    model_validator,
)

from notes.shared.text import iso
from notes.vault.exceptions import NoteNotFound, TitleRequired
from notes.vault.models import UNSET, Criteria, Visibility, make_snippet
from notes.vault.use_cases.create_note import CreateNoteCommand, CreateNoteUseCase
from notes.vault.use_cases.delete_note import DeleteNoteCommand, DeleteNoteUseCase
from notes.vault.use_cases.list_notes import ListNotesCommand, ListNotesUseCase
from notes.vault.use_cases.read_note import ReadNoteCommand, ReadNoteUseCase
from notes.vault.use_cases.update_note import UpdateNoteCommand, UpdateNoteUseCase

_SCHEMA_DIALECT = "http://json-schema.org/draft-07/schema#"

_VISIBILITY = {
    "type": "string",
    "enum": ["PRIVATE", "PROTECTED", "PUBLIC"],
    "description": (
        "Visibility tier. PRIVATE: only the creator can read. PROTECTED: any "
        "signed-in user can read (default). PUBLIC: anyone with the URL can read."
    ),
}
_NOTE_ID = {"type": "string", "description": "(required) Note UUID."}


def _object(
    properties: dict[str, Any], required: list[str] | None = None
) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    schema["additionalProperties"] = False
    schema["$schema"] = _SCHEMA_DIALECT
    return schema


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


TOOL_SPECS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="list_notes",
        description=(
            "List or search notes in the vault. Optional `query` matches against "
            "title and content (case-insensitive substring, trigram-indexed); "
            "optional `folder` is a slash-separated prefix that also includes "
            'nested folders (e.g. "Programming" matches notes in '
            '"Programming/Rust"). Returns items (id, title, folder, hasContent, '
            "updatedAt, visibility, and snippet when a query matched the content), "
            "total count, and hasMore flag. Use get_note for full content. "
            "Default limit is 20."
        ),
        input_schema=_object(
            {
                "query": {
                    "type": "string",
                    "description": (
                        "Keyword matched against title and content. "
                        "Omit to list all notes."
                    ),
                },
                "folder": {
                    "type": "string",
                    "description": (
                        'Folder path prefix, e.g. "Programming" or '
                        '"Programming/Rust". Includes notes in subfolders.'
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": "Max items to return (default 20, max 100).",
                },
                "offset": {
                    "type": "integer",
                    "description": "Number of items to skip (default 0).",
                },
            }
        ),
    ),
    ToolSpec(
        name="get_note",
        description=(
            "Get full note by id. Returns title, description, content (CommonMark "
            "+ GFM markdown), folder path, visibility tier, and timestamps. Returns "
            "an error if the id is not found or refers to a PRIVATE note owned by "
            "another user."
        ),
        input_schema=_object({"id": _NOTE_ID}, ["id"]),
    ),
    ToolSpec(
        name="create_note",
        description=(
            "Create a new note. `title` is required. `content` is CommonMark + GFM "
            "markdown. `description` is an optional one- or two-sentence summary "
            "(max 500 chars). `folder` is a slash-separated path that nests folders "
            'implicitly (e.g. "Programming/Rust"); omit for a root-level note. '
            "`visibility` defaults to PROTECTED. Returns the new note's id and "
            "metadata."
        ),
        input_schema=_object(
            {
                "title": {
                    "type": "string",
                    "minLength": 1,
                    "description": "(required) Note title.",
                },
                "content": {
                    "type": "string",
                    "description": "Markdown body. Omit for an empty note.",
                },
                "description": {
                    "type": "string",
                    "maxLength": 500,
                    "description": "Short summary surfaced in list / search contexts.",
                },
                "folder": {
                    "type": "string",
                    "description": (
                        'Folder path, slash-separated (e.g. "Programming/Rust"). '
                        "Omit for root."
                    ),
                },
                "visibility": _VISIBILITY,
            },
            ["title"],
        ),
    ),
    ToolSpec(
        name="update_note",
        description=(
            "Update a note by id. Any provided field is set; omitted fields are "
            "left unchanged. Pass `folder: null` or `description: null` to clear "
            "those fields. Returns the updated note. Errors if the id is not "
            "found, soft-deleted, or refers to a PRIVATE note owned by another user."
        ),
        input_schema=_object(
            {
                "id": _NOTE_ID,
                "title": {
                    "type": "string",
                    "minLength": 1,
                    "description": "New title.",
                },
                "content": {
                    "type": "string",
                    "description": "New markdown body (replaces existing content).",
                },
                "description": {
                    "anyOf": [{"type": "string", "maxLength": 500}, {"type": "null"}],
                    "description": "New summary, or null to clear.",
                },
                "folder": {
                    "type": ["string", "null"],
                    "description": "New folder path, or null to move to root.",
                },
                "visibility": _VISIBILITY,
            },
            ["id"],
        ),
    ),
    ToolSpec(
        name="delete_note",
        description=(
            "Soft-delete a note by id. The row stays in the database with "
            "is_deleted=true and disappears from every read endpoint, but can be "
            "recovered manually if needed. Errors if the id is not found, already "
            "deleted, or refers to a PRIVATE note owned by another user."
        ),
        input_schema=_object({"id": _NOTE_ID}, ["id"]),
    ),
)


# ── Arguments ────────────────────────────────────────────────────────────────

VisibilityName = Literal["PRIVATE", "PROTECTED", "PUBLIC"]


class _Arguments(BaseModel):
    """A zod object, as the tools declared theirs: unknown keys dropped, and
    an explicit null refused except where `.nullable()` allowed one."""

    model_config = ConfigDict(extra="ignore")
    NULLABLE: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _no_stray_nulls(cls, data: Any) -> Any:
        if isinstance(data, Mapping):
            for key, value in data.items():
                if (
                    value is None
                    and key in cls.model_fields
                    and key not in cls.NULLABLE
                ):
                    raise ValueError(f"{key}: Expected a value, received null")
        return data


class ListNotesArguments(_Arguments):
    query: StrictStr | None = None
    folder: StrictStr | None = None
    limit: StrictInt | None = None
    offset: StrictInt | None = None


class NoteIdArguments(_Arguments):
    id: StrictStr


class CreateNoteArguments(_Arguments):
    title: StrictStr = Field(min_length=1)
    content: StrictStr | None = None
    description: StrictStr | None = Field(default=None, max_length=500)
    folder: StrictStr | None = None
    visibility: VisibilityName | None = None


class UpdateNoteArguments(_Arguments):
    NULLABLE: ClassVar[frozenset[str]] = frozenset({"description", "folder"})

    id: StrictStr
    title: StrictStr | None = Field(default=None, min_length=1)
    content: StrictStr | None = None
    description: StrictStr | None = Field(default=None, max_length=500)
    folder: StrictStr | None = None
    visibility: VisibilityName | None = None

    def given(self, name: str) -> Any:
        return getattr(self, name) if name in self.model_fields_set else UNSET


# ── Calling them ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class VaultTools:
    """The use cases a tool call may reach, built per call by the endpoint."""

    list_notes: ListNotesUseCase
    read_note: ReadNoteUseCase
    create_note: CreateNoteUseCase
    update_note: UpdateNoteUseCase
    delete_note: DeleteNoteUseCase


class ToolCallRefused(Exception):
    """A call the SDK would have refused before running anything: an unknown
    tool, or arguments that do not fit its schema. The message is what the
    Node SDK put in its error result."""


NOT_FOUND = {"error": "Note not found"}
TITLE_REQUIRED = {"error": "Title is required"}


async def call_tool(
    name: str, arguments: Mapping[str, Any] | None, user_id: str, vault: VaultTools
) -> Any:
    """Run one tool and return the JSON value its text result carries."""
    given = dict(arguments or {})
    try:
        if name == "list_notes":
            return await _list_notes(
                ListNotesArguments.model_validate(given), user_id, vault
            )
        if name == "get_note":
            return await _get_note(
                NoteIdArguments.model_validate(given), user_id, vault
            )
        if name == "create_note":
            return await _create_note(
                CreateNoteArguments.model_validate(given), user_id, vault
            )
        if name == "update_note":
            return await _update_note(
                UpdateNoteArguments.model_validate(given), user_id, vault
            )
        if name == "delete_note":
            return await _delete_note(
                NoteIdArguments.model_validate(given), user_id, vault
            )
    except ValidationError as invalid:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in error['loc']) or '(arguments)'}: {error['msg']}"
            for error in invalid.errors()
        )
        raise ToolCallRefused(
            f"MCP error -32602: Input validation error: Invalid arguments for tool "
            f"{name}: {problems}"
        ) from invalid
    raise ToolCallRefused(f"MCP error -32602: Tool {name} not found")


async def _list_notes(args: ListNotesArguments, user_id: str, vault: VaultTools) -> Any:
    # The Nuxt tool passed these to Prisma unclamped below; a negative take
    # reversed the page there. Here they are bounded.
    limit = max(0, min(args.limit if args.limit is not None else 20, 100))
    offset = max(0, args.offset or 0)
    page = await vault.list_notes.execute(
        ListNotesCommand(
            viewer=user_id,
            criteria=Criteria(
                search=args.query or "",
                folder=args.folder or "",
                limit=limit,
                offset=offset,
            ),
        )
    )
    return {
        "items": [
            {
                "id": note.id,
                "title": note.title,
                "folder": note.folder,
                "visibility": note.visibility.value,
                "hasContent": len(note.content) > 0,
                "snippet": make_snippet(note.content, args.query),
                "updatedAt": iso(note.updated_at),
            }
            for note in page.items
        ],
        "total": page.total,
        "hasMore": offset + len(page.items) < page.total,
    }


async def _get_note(args: NoteIdArguments, user_id: str, vault: VaultTools) -> Any:
    try:
        note = await vault.read_note.execute(
            ReadNoteCommand(viewer=user_id, key=args.id)
        )
    except NoteNotFound:
        return NOT_FOUND
    return {
        "id": note.id,
        "slug": note.slug,
        "title": note.title,
        "folder": note.folder,
        "description": note.description,
        "content": note.content,
        "visibility": note.visibility.value,
        "is_shared": note.is_shared,
        "created_at": iso(note.created_at),
        "updated_at": iso(note.updated_at),
    }


async def _create_note(
    args: CreateNoteArguments, user_id: str, vault: VaultTools
) -> Any:
    try:
        note = await vault.create_note.execute(
            CreateNoteCommand(
                owner=user_id,
                title=args.title,
                content=args.content or "",
                folder=args.folder,
                description=args.description,
                visibility=Visibility(args.visibility or "PROTECTED"),
            )
        )
    except TitleRequired:
        return TITLE_REQUIRED
    return {
        "id": note.id,
        "title": note.title,
        "description": note.description,
        "folder": note.folder,
        "visibility": note.visibility.value,
        "created_at": iso(note.created_at),
        "updated_at": iso(note.updated_at),
    }


async def _update_note(
    args: UpdateNoteArguments, user_id: str, vault: VaultTools
) -> Any:
    visibility = args.given("visibility")
    try:
        note = await vault.update_note.execute(
            UpdateNoteCommand(
                viewer=user_id,
                key=args.id,
                title=args.given("title"),
                content=args.given("content"),
                folder=args.given("folder"),
                description=args.given("description"),
                visibility=UNSET if visibility is UNSET else Visibility(visibility),
            )
        )
    except NoteNotFound:
        return NOT_FOUND
    except TitleRequired:
        return TITLE_REQUIRED
    return {
        "id": note.id,
        "title": note.title,
        "description": note.description,
        "folder": note.folder,
        "visibility": note.visibility.value,
        "updated_at": iso(note.updated_at),
    }


async def _delete_note(args: NoteIdArguments, user_id: str, vault: VaultTools) -> Any:
    try:
        deleted = await vault.delete_note.execute(
            DeleteNoteCommand(viewer=user_id, key=args.id)
        )
    except NoteNotFound:
        return NOT_FOUND
    return {"deleted": deleted}
