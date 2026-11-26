import time
import uuid

import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from notes.shared.api.errors import error_response

# Traefik polls /api/health every two seconds and the image's HEALTHCHECK
# polls /health; neither does anything worth a line.
_UNLOGGED = frozenset({"/health", "/api/health"})

# The largest body this server will read. Generous, because a note carries its
# pasted images inline as data: URLs and one with a few screenshots is
# megabytes — but not unbounded: the body is read before anybody is asked
# whether the caller may write at all.
MAX_BODY = 32 * 1024 * 1024


class BodyLimit:
    """Refuses a request whose body is larger than this server will read.

    `Content-Length` is refused before a byte is read; a chunked body is
    counted as it arrives and cut off the moment it passes the limit.
    """

    def __init__(self, app: ASGIApp, *, limit: int = MAX_BODY) -> None:
        self._app = app
        self._limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self._limit:
            response = error_response(
                Request(scope),
                413,
                "Payload Too Large",
                "that request is larger than this server reads",
                code="body_too_large",
            )
            await response(scope, receive, send)
            return

        read = 0
        too_big = False

        async def counting() -> Message:
            nonlocal read, too_big
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > self._limit:
                    # Not an exception: ending the stream leaves the parser
                    # with a short body, which it refuses on its own — and the
                    # flag below turns that into the right status.
                    too_big = True
                    return {"type": "http.disconnect"}
            return message

        async def guarding(message: Message) -> None:
            if too_big and message["type"] == "http.response.start":
                message = dict(message)
                message["status"] = 413
            await send(message)

        await self._app(scope, counting, guarding)


class RequestContext:
    """Binds the request's identity for the logs and writes one line per
    request when it ends — what the Nuxt app's log middleware did.

    The request id goes back as `x-request-id`, as it did there, so a report
    from somebody's browser can be matched to the line. Raw ASGI rather than
    BaseHTTPMiddleware, which costs a task group and two memory streams per
    request to turn the protocol back into a request/response pair.
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=scope["method"],
            path=scope["path"],
        )
        started = time.perf_counter()
        status = 0

        async def sending(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["x-request-id"] = request_id
            await send(message)

        try:
            await self._app(scope, receive, sending)
        finally:
            if scope["path"] not in _UNLOGGED:
                structlog.get_logger().info(
                    "request",
                    status=status,
                    ms=round((time.perf_counter() - started) * 1000, 2),
                )
