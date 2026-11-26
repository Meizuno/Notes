from dataclasses import dataclass

from notes.vault.exceptions import NoteNotFound
from notes.vault.models import UNSET, Note, Unset, Visibility, changes_from
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class UpdateNoteCommand:
    viewer: str
    key: str
    title: str | Unset = UNSET
    content: str | Unset = UNSET
    folder: str | Unset | None = UNSET
    description: str | Unset | None = UNSET
    visibility: Visibility | Unset = UNSET
    is_shared: bool | Unset = UNSET


class UpdateNoteUseCase:
    """Writes only the fields given, within the viewer's scope.

    Any signed-in user may edit any PUBLIC or PROTECTED note — the shared
    workspace — but another user's PRIVATE note is out of reach, and reads
    as not found.
    """

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: UpdateNoteCommand) -> Note:
        changes = changes_from(
            title=command.title,
            content=command.content,
            folder=command.folder,
            description=command.description,
            visibility=command.visibility,
            is_shared=command.is_shared,
        )
        updated = await self._notes.update(command.viewer, command.key, changes)
        if updated is None:
            raise NoteNotFound(command.key)
        return updated
