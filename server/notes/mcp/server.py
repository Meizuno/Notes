"""The MCP server: the official SDK's low-level Server, five tools.

Low-level rather than the decorator API, because the tool list has to read
exactly as the Node server published it — input schemas included — and the
decorator API would derive its own from Python signatures.

The endpoint runs it statelessly over Streamable HTTP, a fresh transport per
request as the Nuxt handler did (`sessionIdGenerator: undefined`). Who is
calling is resolved by the HTTP gate before the request reaches the SDK and
left on the request's state, which the SDK hands each handler as
`ctx.request`.
"""

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, Final

import mcp_types as types
import orjson
from mcp.server.context import ServerRequestContext
from mcp.server.lowlevel.server import Server

from notes.mcp.tools import TOOL_SPECS, ToolCallRefused, VaultTools, call_tool
from notes.shared.adapters import get_logger
from notes.shared.exceptions import NotesError

SERVER_NAME: Final = "notes"
SERVER_VERSION: Final = "1.0.0"

# Where the endpoint leaves the caller's user id on the request's state.
USER_KEY: Final = "notes_mcp_user"

OpenVault = Callable[[], AbstractAsyncContextManager[VaultTools]]


def _text(value: str, *, error: bool = False) -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=value)],
        is_error=error,
    )


def _user_of(ctx: ServerRequestContext[Any, Any]) -> str | None:
    request = ctx.request
    if request is None:
        return None
    user = getattr(request.state, USER_KEY, None)
    return user if isinstance(user, str) else None


def build_server(open_vault: OpenVault) -> Server[Any]:
    """The server, with the tools reaching the vault through `open_vault` —
    a connection and the use cases over it, for the length of one call."""
    logger = get_logger()

    async def list_tools(
        _ctx: ServerRequestContext[Any, Any],
        _params: types.PaginatedRequestParams | None,
    ) -> types.ListToolsResult:
        return types.ListToolsResult(
            tools=[
                types.Tool(
                    name=spec.name,
                    description=spec.description,
                    input_schema=spec.input_schema,
                )
                for spec in TOOL_SPECS
            ]
        )

    async def run_tool(
        ctx: ServerRequestContext[Any, Any], params: types.CallToolRequestParams
    ) -> types.CallToolResult:
        user_id = _user_of(ctx)
        if user_id is None:  # pragma: no cover - the endpoint always sets it
            return _text("Unauthorized", error=True)
        try:
            async with open_vault() as vault:
                payload = await call_tool(params.name, params.arguments, user_id, vault)
        except ToolCallRefused as refused:
            return _text(str(refused), error=True)
        except NotesError as failed:
            # A rule the use case enforces (a title too long, the pool full):
            # an error result, as a thrown error became one in the Node SDK.
            return _text(failed.message, error=True)
        except Exception as crashed:
            logger.exception("mcp_tool_failed", tool=params.name, error=str(crashed))
            return _text("Internal error", error=True)
        # JSON.stringify's spelling: compact, non-ASCII as it is.
        return _text(orjson.dumps(payload).decode())

    return Server(
        SERVER_NAME,
        version=SERVER_VERSION,
        on_list_tools=list_tools,
        on_call_tool=run_tool,
    )
