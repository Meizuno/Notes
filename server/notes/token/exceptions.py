from notes.shared.exceptions import ApplicationError


class InvalidTokenRequest(ApplicationError):
    code = "invalid_token_request"
    status = 400
    status_message = "Validation Error"
