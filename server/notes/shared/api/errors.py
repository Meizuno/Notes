from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from notes.shared.adapters import get_logger
from notes.shared.exceptions import NotesError

# What Nitro put on every error it rendered. Kept, so a failure here reads
# exactly as one from the Nuxt app did — headers included.
_ERROR_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "script-src 'none'; frame-ancestors 'none';",
    "cache-control": "no-cache",
}

_STATUS_MESSAGES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Payload Too Large",
    429: "Too Many Requests",
}

_CODES_BY_STATUS = {
    400: "invalid_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "body_too_large",
    429: "too_many_requests",
}


def request_url(request: Request) -> str:
    """The URL Nitro reported: forwarded host and protocol honoured."""
    headers = request.headers
    host = headers.get("x-forwarded-host") or headers.get("host") or "localhost"
    proto = (
        "https" if headers.get("x-forwarded-proto") == "https" else request.url.scheme
    )
    query = f"?{request.url.query}" if request.url.query else ""
    return f"{proto}://{host}{request.url.path}{query}"


def error_response(
    request: Request,
    status: int,
    status_message: str,
    message: str,
    *,
    code: str,
    data: Any = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """The one failure shape this server uses: Nitro's, plus Forma's `code`.

        {"error": true, "url": "...", "statusCode": 404,
         "statusMessage": "Note not found", "message": "Note x not found",
         "code": "not_found"}

    The Nuxt client never parsed these, but ai-chat and anybody with a curl
    habit saw this shape, so it stays; `code` is the stable, translatable
    part a new client can key on. `data` appears only when there is some, as
    JSON.stringify dropped an undefined one.
    """
    body: dict[str, Any] = {
        "error": True,
        "url": request_url(request),
        "statusCode": status,
        "statusMessage": status_message,
        "message": message,
    }
    if data is not None:
        body["data"] = data
    body["code"] = code
    return JSONResponse(
        status_code=status,
        content=body,
        headers={**_ERROR_HEADERS, **(headers or {})},
    )


def register_error_handlers(app: FastAPI) -> None:
    logger = get_logger()

    @app.exception_handler(NotesError)
    async def _notes_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, NotesError)  # noqa: S101 - narrowing for mypy
        return error_response(
            request,
            exc.status,
            exc.status_message,
            exc.message,
            code=exc.code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
        """FastAPI's 422 rewritten as h3's: 400 "Validation Error".

        That is what `readValidatedBody` / `getValidatedQuery` answered when
        zod refused, and the issues ride in `data` the way the ZodError did.
        """
        assert isinstance(exc, RequestValidationError)  # noqa: S101 - narrowing for mypy
        issues = [_issue(error) for error in exc.errors()]
        message = "; ".join(
            f"{'.'.join(str(p) for p in issue['path']) or '(body)'}: {issue['message']}"
            for issue in issues
        )
        return error_response(
            request,
            400,
            "Validation Error",
            message or "Validation Error",
            code="invalid_body",
            data={"issues": issues},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)  # noqa: S101 - narrowing for mypy
        if exc.status_code == 404:
            # What the Nuxt renderer said for a path nothing answers.
            text = f"Page not found: {request.url.path}"
            return error_response(request, 404, text, text, code="not_found")
        status_message = _STATUS_MESSAGES.get(exc.status_code, "Error")
        detail: Any = exc.detail
        return error_response(
            request,
            exc.status_code,
            status_message,
            detail if isinstance(detail, str) else status_message,
            code=_CODES_BY_STATUS.get(exc.status_code, "error"),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        """Anything unrecognised is logged here and reported as a bare 500.

        Nitro masked an unhandled error's message as "Server Error" too:
        driver error text names tables, constraints and sometimes values.
        """
        logger.exception("unhandled_error", error=str(exc))
        return error_response(
            request, 500, "Server Error", "Server Error", code="internal"
        )


def _issue(error: Mapping[str, Any]) -> dict[str, Any]:
    location: Sequence[Any] = error.get("loc", ())
    # FastAPI prefixes the location with where it was read from; the zod
    # issues the Nuxt app sent had the field path only.
    path = list(location[1:]) if location else []
    return {"path": path, "message": str(error.get("msg", "Invalid input"))}
