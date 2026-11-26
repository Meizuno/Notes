from dataclasses import dataclass
from datetime import datetime
from enum import Enum, StrEnum
from typing import Final

from notes.shared.text import js_length, trim
from notes.vault.exceptions import InvalidNote, TitleRequired

TITLE_MAX: Final = 300
FOLDER_MAX: Final = 500
DESCRIPTION_MAX: Final = 500


class Visibility(StrEnum):
    """Who may READ a note. Writes always need a signed-in user.

    PUBLIC — anyone, anonymous visitors included. PROTECTED — any signed-in
    user (the default: the shared-workspace baseline). PRIVATE — only the
    creator, matched against the note's user_id.
    """

    PRIVATE = "PRIVATE"
    PROTECTED = "PROTECTED"
    PUBLIC = "PUBLIC"


@dataclass(kw_only=True)
class Note:
    """A note as one is read: the wire `Note` plus created_at.

    `user_id` is deliberately absent — no reader is ever told who wrote a
    note, as the Nuxt app's projection never did.
    """

    id: str
    slug: str
    title: str
    folder: str | None
    description: str | None
    content: str
    visibility: Visibility
    is_shared: bool
    created_at: datetime
    updated_at: datetime

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Note):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)


@dataclass(frozen=True)
class NoteListItem:
    """A row of a list or search: carries `content` so a caller can derive a
    snippet and hasContent, and `visibility` for MCP."""

    id: str
    slug: str
    title: str
    folder: str | None
    content: str
    visibility: Visibility
    updated_at: datetime


@dataclass(frozen=True)
class NoteSummary:
    """The cheap projection the tree, the graph and the sitemap read."""

    id: str
    slug: str
    title: str
    folder: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class NotePage:
    items: list[NoteListItem]
    total: int


@dataclass(frozen=True)
class Criteria:
    """A list or search. `folder` takes the folder and everything under it;
    `limit` None means all of them (the prompts' folders view)."""

    search: str = ""
    folder: str = ""
    limit: int | None = 20
    offset: int = 0


@dataclass(frozen=True)
class NoteDraft:
    """A note about to be created, already cleaned by `draft_from`."""

    title: str
    content: str
    folder: str | None
    description: str | None
    visibility: Visibility
    is_shared: bool


class Unset(Enum):
    UNSET = "unset"


# "Leave this field as it is." Distinct from None, which for folder and
# description means "clear it".
UNSET: Final = Unset.UNSET


@dataclass(frozen=True)
class NoteChanges:
    """A partial update: only the fields that are not UNSET are written."""

    title: str | Unset = UNSET
    content: str | Unset = UNSET
    folder: str | Unset | None = UNSET
    description: str | Unset | None = UNSET
    visibility: Visibility | Unset = UNSET
    is_shared: bool | Unset = UNSET

    def written(self) -> dict[str, object]:
        """The fields this update writes, by column name."""
        return {
            name: value
            for name, value in (
                ("title", self.title),
                ("content", self.content),
                ("folder", self.folder),
                ("description", self.description),
                ("visibility", self.visibility),
                ("is_shared", self.is_shared),
            )
            if value is not UNSET
        }


def _optional_text(value: str | None, limit: int, field: str) -> str | None:
    """Trimmed; empty or whitespace collapses to None."""
    if value is None:
        return None
    cleaned = trim(value)
    if js_length(cleaned) > limit:
        raise InvalidNote(f"{field} must be at most {limit} characters")
    return cleaned or None


def _title(value: str) -> str:
    cleaned = trim(value)
    if not cleaned:
        raise TitleRequired("Title is required")
    if js_length(cleaned) > TITLE_MAX:
        raise InvalidNote(f"title must be at most {TITLE_MAX} characters")
    return cleaned


def draft_from(
    *,
    title: str,
    content: str = "",
    folder: str | None = None,
    description: str | None = None,
    visibility: Visibility = Visibility.PROTECTED,
    is_shared: bool = False,
) -> NoteDraft:
    """A new note's fields, cleaned.

    PUBLIC notes are shared by definition, so the flag is forced true for
    them regardless of what was sent — it can never disagree with the tier.
    """
    return NoteDraft(
        title=_title(title),
        content=content,
        folder=_optional_text(folder, FOLDER_MAX, "folder"),
        description=_optional_text(description, DESCRIPTION_MAX, "description"),
        visibility=visibility,
        is_shared=True if visibility is Visibility.PUBLIC else is_shared,
    )


def changes_from(
    *,
    title: str | Unset = UNSET,
    content: str | Unset = UNSET,
    folder: str | Unset | None = UNSET,
    description: str | Unset | None = UNSET,
    visibility: Visibility | Unset = UNSET,
    is_shared: bool | Unset = UNSET,
) -> NoteChanges:
    """The Nuxt app's buildNoteUpdateData: only what was given is written;
    the title is trimmed; folder and description collapse empty to None; and
    a change to PUBLIC forces is_shared true, whatever (or whether) a flag
    was sent with it."""
    shared: bool | Unset = True if visibility is Visibility.PUBLIC else is_shared
    return NoteChanges(
        title=UNSET if title is UNSET else _title(title),
        content=content,
        folder=UNSET
        if folder is UNSET
        else _optional_text(folder, FOLDER_MAX, "folder"),
        description=(
            UNSET
            if description is UNSET
            else _optional_text(description, DESCRIPTION_MAX, "description")
        ),
        visibility=visibility,
        is_shared=shared,
    )


SNIPPET_LENGTH: Final = 120
SNIPPET_CONTEXT: Final = 40


def make_snippet(content: str, search: str | None = None) -> str | None:
    """The line shown under a title in a list or a search result.

    Search-aware: a window of forty characters either side of the first
    match, else the first hundred and twenty. None for an empty note.
    """
    if not content:
        return None
    if search:
        index = content.lower().find(search.lower())
        if index >= 0:
            start = max(0, index - SNIPPET_CONTEXT)
            end = min(len(content), index + len(search) + SNIPPET_CONTEXT)
            return (
                ("…" if start > 0 else "")
                + content[start:end]
                + ("…" if end < len(content) else "")
            )
    return trim(content[:SNIPPET_LENGTH]) + (
        "…" if len(content) > SNIPPET_LENGTH else ""
    )
