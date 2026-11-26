from notes.shared.exceptions import ApplicationError, DomainError


class Unauthorized(ApplicationError):
    """The request needs a signed-in user and has none. 401, as the Nuxt
    app's `Unauthorized` was."""

    code = "unauthorized"
    status = 401
    status_message = "Unauthorized"


class SessionExpired(DomainError):
    """The access or refresh token is missing, spent, revoked or replayed."""

    code = "session_expired"
    status = 401
    status_message = "Unauthorized"


class NotAllowed(ApplicationError):
    """An address that is not on NOTES_ALLOWED_EMAILS. No account is made.

    The code is what the login page reads from `?error=` after a Google
    sign-in; the dev sign-in answers it as a 403 body.
    """

    code = "not_allowed"
    status = 403
    status_message = "Forbidden"


class BadEmail(DomainError):
    code = "bad_email"
    status = 400
    status_message = "Validation Error"


class GoogleSignInFailed(ApplicationError):
    """Anything that stops a Google sign-in short of a session.

    Reported as `/login?error=auth_failed`: the person arrives by navigation,
    so there is no fetch waiting to read a body, and the login page has one
    message for all of these. The specific reason goes to the log.
    """

    code = "auth_failed"
    status = 401
    status_message = "Unauthorized"


class DevLoginDisabled(ApplicationError):
    """The dev sign-in, asked for where it is off. Answered as the route not
    existing, which is what it is on a deployment."""

    code = "not_found"
    status = 404
    status_message = "Not Found"
