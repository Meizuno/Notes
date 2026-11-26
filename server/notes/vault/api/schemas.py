"""The note's wire shapes — requests as the Nuxt app's zod schemas took them
(shared/schemas/note.ts), responses as its handlers answered.

Strict types where zod was strict: a number is not a title, "true" is not a
boolean. Unknown keys are dropped, as a zod object drops them.
"""

import math
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictStr,
    field_validator,
)

from notes.shared.text import iso, js_length, trim
from notes.vault.graph import Graph, GraphNode
from notes.vault.models import UNSET, Note, NoteSummary, Unset, Visibility

VisibilityName = Literal["PRIVATE", "PROTECTED", "PUBLIC"]


def _title(value: str) -> str:
    value = trim(value)
    if not value:
        raise ValueError("Title is required")
    if js_length(value) > 300:
        raise ValueError("Too big: expected string to have <=300 characters")
    return value


def _optional_text(value: str | None) -> str | None:
    """Trimmed and capped at 500. Empty is allowed here; collapsing it to
    null is the use case's business, as it was the service's."""
    if value is None:
        return None
    value = trim(value)
    if js_length(value) > 500:
        raise ValueError("Too big: expected string to have <=500 characters")
    return value


class NoteCreate(BaseModel):
    """POST /api/notes — createNoteSchema."""

    model_config = ConfigDict(extra="ignore")

    title: StrictStr
    content: StrictStr = ""
    folder: StrictStr | None = None
    description: StrictStr | None = None
    visibility: VisibilityName = "PROTECTED"
    # "Anyone with the link can read". Forced true for PUBLIC downstream,
    # whatever is sent here.
    is_shared: StrictBool = False

    _clean_title = field_validator("title")(_title)
    _clean_text = field_validator("folder", "description")(_optional_text)


class NoteUpdate(BaseModel):
    """PUT /api/notes/{key} — updateNoteSchema. Every field optional; only
    the keys present are written, so omission means "leave unchanged". Only
    folder and description take an explicit null (clear it)."""

    model_config = ConfigDict(extra="ignore")

    title: StrictStr | None = None
    content: StrictStr | None = None
    folder: StrictStr | None = None
    description: StrictStr | None = None
    visibility: VisibilityName | None = None
    is_shared: StrictBool | None = None

    @field_validator("title", "content", "visibility", "is_shared", mode="before")
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        # Only reached when the key was sent: an explicit null is refused
        # where zod's `.optional()` (without `.nullable()`) refused it.
        if value is None:
            raise ValueError("Invalid input: expected a value, received null")
        return value

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        return None if value is None else _title(value)

    _clean_text = field_validator("folder", "description")(_optional_text)

    def given(self, name: str) -> Any:
        """The field's value if it was sent, else UNSET."""
        return getattr(self, name) if name in self.model_fields_set else UNSET


def _js_number(value: Any) -> Any:
    """`z.coerce.number().int()` on a query string: JavaScript's Number(),
    then "must be an integer". An empty value is 0, as Number('') is."""
    if isinstance(value, bool):
        raise ValueError("Invalid input: expected number")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        number = value
    else:
        text = trim(str(value))
        if text == "":
            return 0
        try:
            number = float(text)
        except ValueError:
            raise ValueError("Invalid input: expected number, received NaN") from None
    if math.isnan(number) or math.isinf(number) or not number.is_integer():
        raise ValueError("Invalid input: expected int, received number")
    return int(number)


class ListNotesQuery(BaseModel):
    """GET /api/notes — listNotesQuerySchema."""

    model_config = ConfigDict(extra="ignore")

    search: Annotated[str, BeforeValidator(lambda v: trim(str(v)))] = ""
    folder: Annotated[str, BeforeValidator(lambda v: trim(str(v)))] = ""
    limit: Annotated[int, BeforeValidator(_js_number), Field(ge=1, le=100)] = 20
    offset: Annotated[int, BeforeValidator(_js_number), Field(ge=0)] = 0


class NoteResponse(BaseModel):
    """A note as GET, POST and PUT answer it: the wire Note plus created_at.
    Key order is the Nuxt app's NOTE_SELECT."""

    id: str
    slug: str
    title: str
    folder: str | None
    description: str | None
    content: str
    visibility: VisibilityName
    is_shared: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_domain(cls, note: Note) -> "NoteResponse":
        return cls(
            id=note.id,
            slug=note.slug,
            title=note.title,
            folder=note.folder,
            description=note.description,
            content=note.content,
            visibility=note.visibility.value,
            is_shared=note.is_shared,
            created_at=iso(note.created_at),
            updated_at=iso(note.updated_at),
        )


class DeletedResponse(BaseModel):
    """`{"deleted": key}` — the key exactly as the caller sent it."""

    deleted: str


class TreeEntryResponse(BaseModel):
    id: str
    slug: str
    title: str
    folder: str | None
    created_at: str

    @classmethod
    def from_domain(cls, note: NoteSummary) -> "TreeEntryResponse":
        return cls(
            id=note.id,
            slug=note.slug,
            title=note.title,
            folder=note.folder,
            created_at=iso(note.created_at),
        )


class FolderNodeResponse(BaseModel):
    id: str
    title: str
    type: Literal["folder"]
    folder: str | None
    links: int


class NoteNodeResponse(BaseModel):
    """A note node carries `slug`, which drives its /<slug> link; a folder
    node has no such key at all — not a null."""

    id: str
    slug: str
    title: str
    type: Literal["note"]
    folder: str | None
    links: int


class EdgeResponse(BaseModel):
    source: str
    target: str


GraphNodeResponse = Annotated[
    NoteNodeResponse | FolderNodeResponse, Field(discriminator="type")
]


def node_response(node: GraphNode) -> NoteNodeResponse | FolderNodeResponse:
    if node.type == "note":
        return NoteNodeResponse(
            id=node.id,
            slug=node.slug or "",
            title=node.title,
            type="note",
            folder=node.folder,
            links=node.links,
        )
    return FolderNodeResponse(
        id=node.id,
        title=node.title,
        type="folder",
        folder=node.folder,
        links=node.links,
    )


class GraphResponse(BaseModel):
    nodes: list[GraphNodeResponse]
    edges: list[EdgeResponse]

    @classmethod
    def from_domain(cls, graph: Graph) -> "GraphResponse":
        return cls(
            nodes=[node_response(node) for node in graph.nodes],
            edges=[EdgeResponse(source=e.source, target=e.target) for e in graph.edges],
        )


def visibility_of(name: VisibilityName | Unset | None) -> Visibility | Unset:
    if name is None or name is UNSET:
        return UNSET
    return Visibility(name)
