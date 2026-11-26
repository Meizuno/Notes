from datetime import datetime

from notes.vault.graph import ancestor_paths, build_graph, leaf_name, parent_of
from notes.vault.models import NoteSummary

T = datetime(2026, 1, 1)


def _note(note_id: str, folder: str | None) -> NoteSummary:
    return NoteSummary(
        id=note_id,
        slug=f"s-{note_id}",
        title=note_id,
        folder=folder,
        created_at=T,
        updated_at=T,
    )


def test_path_helpers():
    assert ancestor_paths("Programming/Languages") == [
        "Programming",
        "Programming/Languages",
    ]
    assert ancestor_paths("a//b") == ["a", "a/b"]
    assert parent_of("a/b/c") == "a/b"
    assert parent_of("a") is None
    assert leaf_name("a/b/c") == "c"


def test_folders_first_then_notes_with_degrees():
    graph = build_graph(
        [
            _note("n1", "Programming/Languages"),
            _note("n2", "Programming"),
            _note("n3", None),
        ]
    )
    nodes = {(n.id, n.type, n.title, n.folder, n.links, n.slug) for n in graph.nodes}
    assert [n.type for n in graph.nodes] == ["folder", "folder", "note", "note", "note"]
    assert nodes == {
        ("folder:Programming", "folder", "Programming", None, 2, None),
        (
            "folder:Programming/Languages",
            "folder",
            "Languages",
            "Programming",
            2,
            None,
        ),
        ("n1", "note", "n1", "Programming/Languages", 1, "s-n1"),
        ("n2", "note", "n2", "Programming", 1, "s-n2"),
        ("n3", "note", "n3", None, 0, "s-n3"),
    }
    assert [(e.source, e.target) for e in graph.edges] == [
        ("n1", "folder:Programming/Languages"),
        ("n2", "folder:Programming"),
        ("folder:Programming/Languages", "folder:Programming"),
    ]


def test_an_empty_folder_string_is_the_root():
    graph = build_graph([_note("n1", "")])
    assert [n.id for n in graph.nodes] == ["n1"]
    assert graph.edges == []
