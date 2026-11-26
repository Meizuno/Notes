from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import asyncpg
from fastapi import APIRouter, Depends, Request
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from notes.auth.api.security import get_caller
from notes.mcp.server import USER_KEY, OpenVault, build_server
from notes.mcp.tools import VaultTools
from notes.shared.api.middleware import MAX_BODY
from notes.shared.database import borrowed
from notes.vault.repositories import SqlNoteRepository
from notes.vault.use_cases.create_note import CreateNoteUseCase
from notes.vault.use_cases.delete_note import DeleteNoteUseCase
from notes.vault.use_cases.list_notes import ListNotesUseCase
from notes.vault.use_cases.read_note import ReadNoteUseCase
from notes.vault.use_cases.update_note import UpdateNoteUseCase

router = APIRouter(tags=["mcp"])


def vault_opener(pool: asyncpg.Pool) -> OpenVault:
    """The composition for a tool call: a pooled connection, the repository
    over it, and the use cases over that — given back when the call ends."""

    @asynccontextmanager
    async def open_vault() -> AsyncIterator[VaultTools]:
        async with borrowed(pool) as connection:
            notes = SqlNoteRepository(connection)
            yield VaultTools(
                list_notes=ListNotesUseCase(notes),
                read_note=ReadNoteUseCase(notes),
                create_note=CreateNoteUseCase(notes),
                update_note=UpdateNoteUseCase(notes),
                delete_note=DeleteNoteUseCase(notes),
            )

    return open_vault


def session_manager(pool: asyncpg.Pool) -> StreamableHTTPSessionManager:
    """One per app, run for the app's lifetime (see main.lifespan).

    Stateless — a fresh transport per request, no session ids — and answering
    with an event stream, as the Node transport did by default. The body limit
    matches the rest of the API's: a note created through MCP can carry its
    images inline too.
    """
    return StreamableHTTPSessionManager(
        app=build_server(vault_opener(pool)),
        stateless=True,
        json_response=False,
        max_request_body_size=MAX_BODY,
    )


class _HandedToMcp(Response):
    """A response that is the MCP transport answering the request itself.

    The route has done its part — the gate has resolved who is calling — and
    the body, still unread, belongs to the SDK. Starlette calls this with the
    request's own receive and send.
    """

    def __init__(self, manager: StreamableHTTPSessionManager, user_id: str) -> None:
        super().__init__()
        self._manager = manager
        self._user_id = user_id

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope.setdefault("state", {})[USER_KEY] = self._user_id
        await self._manager.handle_request(scope, receive, send)


@router.api_route("/mcp", methods=["GET", "POST", "DELETE"], include_in_schema=False)
async def mcp(request: Request, user_id: str = Depends(get_caller)) -> Response:
    """MCP over Streamable HTTP, for ai-chat and any other MCP client.

    `Authorization: Bearer <api token>` (or a session) — every tool runs as
    that user, never as a caller-asserted id. 401 without one, before the SDK
    sees anything.
    """
    manager = cast(StreamableHTTPSessionManager, request.app.state.mcp)
    return _HandedToMcp(manager, user_id)
