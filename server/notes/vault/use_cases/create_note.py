from dataclasses import dataclass

from notes.vault.exceptions import SlugTaken
from notes.vault.models import Note, Visibility, draft_from
from notes.vault.ports import NoteRepository
from notes.vault.slugs import is_reserved_slug, slugify_title

# How many times a create is retried when a concurrent one takes the slug it
# chose. One retry is what a race between two people needs; more would only
# matter under a deliberate flood of identical titles.
SLUG_ATTEMPTS = 5


@dataclass(frozen=True)
class CreateNoteCommand:
    owner: str
    title: str
    content: str = ""
    folder: str | None = None
    description: str | None = None
    visibility: Visibility = Visibility.PROTECTED
    is_shared: bool = False


class CreateNoteUseCase:
    """A new note, stamped with its creator.

    The creator is who may see it while it is PRIVATE. The slug is derived
    from the title once, here, and never changes — a later rename keeps it.
    """

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: CreateNoteCommand) -> Note:
        draft = draft_from(
            title=command.title,
            content=command.content,
            folder=command.folder,
            description=command.description,
            visibility=command.visibility,
            is_shared=command.is_shared,
        )
        for attempt in range(SLUG_ATTEMPTS):
            slug = await self.unique_slug(draft.title)
            try:
                return await self._notes.create(command.owner, slug, draft)
            except SlugTaken:
                if attempt == SLUG_ATTEMPTS - 1:
                    raise
        raise AssertionError("unreachable")  # pragma: no cover

    async def unique_slug(self, title: str) -> str:
        """The title's slug, then -2, -3, … until one is free — free across
        every row (soft-deleted ones keep theirs) and not one of the reserved
        top-level routes, so a note can never shadow /new or /login."""
        base = slugify_title(title)
        candidate = base
        suffix = 2
        while is_reserved_slug(candidate) or await self._notes.slug_taken(candidate):
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate
