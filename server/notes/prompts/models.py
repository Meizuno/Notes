"""What ai-chat's "Notes overview" prompt is made of: folder buckets and the
counts on its filter chips. Pure functions over the vault's types."""

import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from notes.vault.models import NoteListItem


def top_folder(folder: str | None) -> str:
    """The chip a note counts towards: "Programming/Rust" → "Programming";
    a root note → "" (the empty label)."""
    return folder.split("/")[0] if folder else ""


def label_order(label: str) -> tuple[str, str, str]:
    """An approximation of JavaScript's `localeCompare` for sorting labels.

    The Nuxt app sorted ties with `a.label.localeCompare(b.label)`, which is
    ICU collation: letters compare without their accents first, then the
    accents, then the case, lowercase before uppercase. Python has no ICU in
    the standard library; these three keys give the same order for anything
    a folder is likely to be called. Exotic punctuation may order differently.
    """
    decomposed = unicodedata.normalize("NFD", label)
    bare = "".join(c for c in decomposed if not unicodedata.combining(c))
    return bare.casefold(), decomposed.casefold(), label.swapcase()


@dataclass(frozen=True)
class FolderCount:
    label: str
    count: int


@dataclass(frozen=True)
class FolderBucket:
    label: str
    notes: list[NoteListItem]

    @property
    def count(self) -> int:
        return len(self.notes)


def _by_size(label: str, count: int) -> tuple[int, tuple[str, str, str]]:
    # Biggest first; ties alphabetically.
    return -count, label_order(label)


def count_by_top_folder(folders: Iterable[str | None]) -> list[FolderCount]:
    counts: dict[str, int] = {}
    for folder in folders:
        label = top_folder(folder)
        counts[label] = counts.get(label, 0) + 1
    ordered = sorted(counts.items(), key=lambda pair: _by_size(*pair))
    return [FolderCount(label=label, count=count) for label, count in ordered]


def bucket_by_top_folder(notes: Iterable[NoteListItem]) -> list[FolderBucket]:
    """One bucket per top-level folder, each keeping its notes in the order
    given (newest-updated first)."""
    buckets: dict[str, list[NoteListItem]] = {}
    for note in notes:
        buckets.setdefault(top_folder(note.folder), []).append(note)
    ordered = sorted(buckets.items(), key=lambda pair: _by_size(pair[0], len(pair[1])))
    return [FolderBucket(label=label, notes=items) for label, items in ordered]
