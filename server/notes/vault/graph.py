"""The vault as a folder-tree graph — the home page's, and the prompt's.

- One pseudo-node per folder path. Folders are implicit (never stored), and
  every prefix counts as one: `Programming/Languages` yields `Programming`
  and `Programming/Languages`.
- Each note connects to its leaf folder; each folder to its parent. The
  result is a forest in which notes cluster round their folder ancestors.
- `links` is each node's degree, which the renderer sizes discs by.

A folder node's id is `folder:<path>`; a note's is its UUID. The client
treats every id as opaque. Folder nodes come first, so a renderer that paints
in order draws them under the notes.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal

from notes.vault.models import NoteSummary

NodeType = Literal["note", "folder"]


@dataclass
class GraphNode:
    id: str
    title: str
    type: NodeType
    folder: str | None
    links: int = 0
    # Note nodes only — what the /<slug> link is built from.
    slug: str | None = None


@dataclass(frozen=True)
class GraphEdge:
    source: str
    target: str


@dataclass
class Graph:
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)


def folder_id(path: str) -> str:
    return f"folder:{path}"


def ancestor_paths(folder: str) -> list[str]:
    """ "Programming/Languages" → ["Programming", "Programming/Languages"].
    Empty segments are skipped, as `split('/').filter(Boolean)` skipped them."""
    out: list[str] = []
    acc = ""
    for part in (p for p in folder.split("/") if p):
        acc = f"{acc}/{part}" if acc else part
        out.append(acc)
    return out


def parent_of(path: str) -> str | None:
    index = path.rfind("/")
    return None if index == -1 else path[:index]


def leaf_name(path: str) -> str:
    index = path.rfind("/")
    return path if index == -1 else path[index + 1 :]


def build_graph(notes: Iterable[NoteSummary]) -> Graph:
    notes = list(notes)
    graph = Graph()

    # Every folder path referenced by any note, ancestors included, in the
    # order first seen — a dict is the ordered set JavaScript's Set was.
    paths: dict[str, None] = {}
    for note in notes:
        if not note.folder:
            continue
        for path in ancestor_paths(note.folder):
            paths.setdefault(path, None)

    for path in paths:
        graph.nodes.append(
            GraphNode(
                id=folder_id(path),
                title=leaf_name(path),
                type="folder",
                folder=parent_of(path),
            )
        )
    for note in notes:
        graph.nodes.append(
            GraphNode(
                id=note.id,
                slug=note.slug,
                title=note.title,
                type="note",
                folder=note.folder,
            )
        )

    for note in notes:
        if note.folder:
            graph.edges.append(GraphEdge(source=note.id, target=folder_id(note.folder)))
    for path in paths:
        parent = parent_of(path)
        if parent is not None:
            graph.edges.append(
                GraphEdge(source=folder_id(path), target=folder_id(parent))
            )

    degree: dict[str, int] = {}
    for edge in graph.edges:
        degree[edge.source] = degree.get(edge.source, 0) + 1
        degree[edge.target] = degree.get(edge.target, 0) + 1
    for node in graph.nodes:
        node.links = degree.get(node.id, 0)
    return graph
