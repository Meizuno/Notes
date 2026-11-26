"""Base exception classes for the whole server.

Every module's exceptions.py inherits from one of these, so the handlers in
`notes.shared.api.errors` can render any of them generically.

- DomainError: a domain invariant was broken (no such note, a title that is
  empty, a session that is spent).
- ApplicationError: a workflow or policy violation enforced by a use case or
  an HTTP gate (not signed in, not on the allow-list).

Each carries the HTTP `status`, the `status_message` the Nuxt app answered
with (its errors were h3's, which carry a statusMessage and a message), and a
machine-readable `code` in Forma's style. The body every failure renders is
the one Nitro rendered — see errors.py.
"""


class NotesError(Exception):
    """Common ancestor, so one handler can catch everything this app raises."""

    code = "unknown"
    status = 500
    status_message = "Server Error"

    # Extra response headers this failure carries. Kept on the exception so
    # the handler stays generic.
    headers: dict[str, str] | None = None

    def __init__(self, message: str | None = None, *, code: str | None = None) -> None:
        text = message if message is not None else self.status_message
        super().__init__(text)
        self.message = text
        if code is not None:
            self.code = code


class DomainError(NotesError):
    pass


class ApplicationError(NotesError):
    pass


class NotFound(DomainError):
    """A key that names nothing this caller may see.

    Deliberately indistinguishable from "does not exist": saying which would
    let anyone probe for other people's PRIVATE notes.
    """

    code = "not_found"
    status = 404
    status_message = "Not Found"


class InvalidInput(ApplicationError):
    """A request the boundary refused. Rendered exactly as a schema failure
    is, so a client sees one shape for "that is not a valid request"."""

    code = "invalid_body"
    status = 400
    status_message = "Validation Error"


class Overloaded(ApplicationError):
    """There was no room to do this now. A refusal rather than a wait —
    asyncpg's pool queue has no deadline of its own."""

    code = "overloaded"
    status = 503
    status_message = "Service Unavailable"
