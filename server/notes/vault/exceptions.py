from notes.shared.exceptions import DomainError, InvalidInput, NotFound


class NoteNotFound(NotFound):
    """A note that does not exist, is deleted, or is not the caller's to see.

    One answer for all three, so a PRIVATE note's existence never leaks.
    Carries what the Nuxt app's did: statusMessage "Note not found" and the
    key in the message.
    """

    status_message = "Note not found"

    def __init__(self, key: str | None = None) -> None:
        super().__init__(f"Note {key} not found" if key else "Note not found")


class InvalidNote(InvalidInput):
    """A field the boundary should have refused and did not — MCP, or a
    future caller. Rendered as a validation failure."""


class TitleRequired(InvalidNote):
    """Its own type because MCP answers it with a tool result of its own,
    `{"error": "Title is required"}`, as the Nuxt tools did."""


class SlugTaken(DomainError):
    """The slug the INSERT tried was taken by a concurrent create between the
    check and the write. CreateNoteUseCase catches it and tries the next."""

    code = "slug_taken"
    status = 409
    status_message = "Conflict"
