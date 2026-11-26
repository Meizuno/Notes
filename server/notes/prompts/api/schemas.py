"""GET /api/prompts/notes's four answers, key for key as the Nuxt handler
built them — ai-chat renders these directly."""

from typing import Literal

from pydantic import BaseModel

from notes.prompts.models import FolderBucket, FolderCount
from notes.prompts.use_cases.read_folders import FoldersView
from notes.prompts.use_cases.read_overview import Overview
from notes.shared.text import iso
from notes.vault.api.schemas import EdgeResponse
from notes.vault.graph import Graph
from notes.vault.models import Note, NoteListItem, make_snippet


class DetailNote(BaseModel):
    id: str
    title: str
    content: str
    folder: str | None
    updated_at: str


class NoteDetailResponse(BaseModel):
    component: Literal["note-detail"] = "note-detail"
    note: DetailNote

    @classmethod
    def from_domain(cls, note: Note) -> "NoteDetailResponse":
        return cls(
            note=DetailNote(
                id=note.id,
                title=note.title,
                content=note.content,
                folder=note.folder,
                updated_at=iso(note.updated_at),
            )
        )


class PromptNode(BaseModel):
    """The graph node without `slug` — the prompt's graph never had one."""

    id: str
    title: str
    type: Literal["note", "folder"]
    folder: str | None
    links: int


class GraphPromptResponse(BaseModel):
    component: Literal["notes"] = "notes"
    view: Literal["graph"] = "graph"
    nodes: list[PromptNode]
    edges: list[EdgeResponse]

    @classmethod
    def from_domain(cls, graph: Graph) -> "GraphPromptResponse":
        return cls(
            nodes=[
                PromptNode(
                    id=node.id,
                    title=node.title,
                    type=node.type,
                    folder=node.folder,
                    links=node.links,
                )
                for node in graph.nodes
            ],
            edges=[EdgeResponse(source=e.source, target=e.target) for e in graph.edges],
        )


class PromptNote(BaseModel):
    id: str
    title: str
    folder: str | None
    snippet: str | None
    hasContent: bool
    updated_at: str

    @classmethod
    def from_domain(cls, note: NoteListItem, search: str = "") -> "PromptNote":
        return cls(
            id=note.id,
            title=note.title,
            folder=note.folder,
            snippet=make_snippet(note.content, search),
            hasContent=len(note.content) > 0,
            updated_at=iso(note.updated_at),
        )


class Bucket(BaseModel):
    label: str
    count: int
    notes: list[PromptNote]

    @classmethod
    def from_domain(cls, bucket: FolderBucket) -> "Bucket":
        return cls(
            label=bucket.label,
            count=bucket.count,
            notes=[PromptNote.from_domain(note) for note in bucket.notes],
        )


class FoldersPromptResponse(BaseModel):
    component: Literal["notes"] = "notes"
    view: Literal["folders"] = "folders"
    folders: list[Bucket]
    total: int

    @classmethod
    def from_domain(cls, view: FoldersView) -> "FoldersPromptResponse":
        return cls(
            folders=[Bucket.from_domain(bucket) for bucket in view.folders],
            total=view.total,
        )


class Chip(BaseModel):
    label: str
    count: int

    @classmethod
    def from_domain(cls, folder: FolderCount) -> "Chip":
        return cls(label=folder.label, count=folder.count)


class OverviewPromptResponse(BaseModel):
    component: Literal["notes"] = "notes"
    folders: list[Chip]
    notes: list[PromptNote]
    total: int
    hasMore: bool
    activeFolder: str
    activeSearch: str

    @classmethod
    def from_domain(
        cls, overview: Overview, *, folder: str, search: str, offset: int
    ) -> "OverviewPromptResponse":
        page = overview.page
        return cls(
            folders=[Chip.from_domain(f) for f in overview.folders],
            notes=[PromptNote.from_domain(note, search) for note in page.items],
            total=page.total,
            hasMore=offset + len(page.items) < page.total,
            activeFolder=folder,
            activeSearch=search,
        )
