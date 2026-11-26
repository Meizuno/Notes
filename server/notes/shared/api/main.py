import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI

from notes.auth.api.cookies import SessionCookies, SessionCookieWriter
from notes.auth.api.router import router as auth_router
from notes.auth.repositories import JwtAccessTokens, forget_spent_sessions
from notes.mcp.api.endpoint import session_manager
from notes.mcp.api.router import router as mcp_router
from notes.prompts.api.router import router as prompts_router
from notes.shared.adapters import get_logger
from notes.shared.api.dependencies import load_settings
from notes.shared.api.errors import register_error_handlers
from notes.shared.api.health import router as health_router
from notes.shared.api.middleware import BodyLimit, RequestContext
from notes.shared.api.spa import mount_spa, seo_router
from notes.shared.config import ConfigurationError
from notes.shared.database import create_pool
from notes.shared.logging_config import configure_logging
from notes.shared.migrations import migrate
from notes.token.api.router import router as token_router
from notes.vault.api.router import router as vault_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = load_settings()
    configure_logging(json_format=settings.logs_as_json, log_level=settings.log_level)
    logger = get_logger()
    if settings.jwt_secret_was_generated:
        logger.warning(
            "jwt_secret_generated",
            reason="NOTES_JWT_SECRET is unset or shorter than 32 characters",
            effect="sessions will not survive a restart",
        )
    if not settings.allowed:
        logger.warning(
            "allow_list_empty",
            effect="nobody can sign in until NOTES_ALLOWED_EMAILS lists somebody",
        )
    if settings.dev_login_enabled:
        logger.warning(
            "dev_login_enabled",
            effect="GET /api/auth/dev signs any allowed address in without a password",
        )

    app.state.pool = await create_pool(settings.database_url)
    if settings.run_migrations:
        await migrate(app.state.pool)
    swept = await forget_spent_sessions(app.state.pool)
    if swept:
        logger.info("sessions_swept", refresh=swept)

    # One verifier for the process: it remembers what it has verified.
    app.state.access_tokens = JwtAccessTokens(settings.jwt_secret, settings.access_ttl)
    # One MCP session manager for the life of the app; it owns the task group
    # every MCP request's transport runs in.
    app.state.mcp = session_manager(app.state.pool)

    logger.info("server_started", port=settings.port)
    async with app.state.mcp.run():
        yield
    await app.state.pool.close()


def create_app() -> FastAPI:
    # Read before anything is built, and loudly: a bad environment stops the
    # process here rather than on the first request that needed the thing
    # that was missing.
    try:
        settings = load_settings()
    except ConfigurationError as broken:
        # Logging is configured in lifespan, which is not reached. A plain
        # write is what somebody reading `docker logs` will actually see.
        print(f"\nnotes: {broken}\n", file=sys.stderr)
        raise

    app = FastAPI(
        title="Notes",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    # Innermost first: the cookie writer sits inside the request log so the
    # log sees the final status, and the body limit outermost so an oversized
    # body is turned away before anything else looks at it.
    app.add_middleware(
        SessionCookieWriter,
        cookies=SessionCookies(
            secure=settings.cookies_are_secure,
            access_ttl=settings.access_ttl,
            refresh_ttl=settings.refresh_ttl,
        ),
    )
    app.add_middleware(RequestContext)
    app.add_middleware(BodyLimit)
    register_error_handlers(app)

    app.include_router(health_router)

    # The API is unversioned, at the paths the client and ai-chat already use.
    api = APIRouter(prefix="/api")
    api.include_router(auth_router)
    api.include_router(vault_router)
    api.include_router(prompts_router)
    api.include_router(token_router)
    api.include_router(mcp_router)
    app.include_router(api)

    app.include_router(seo_router)
    if settings.client_dir:
        mount_spa(app, Path(settings.client_dir))
    return app


# No module-level `app`: building one at import would mean importing this
# module — to collect a test, to run a linter — needs a configured
# environment. The ASGI entrypoint is the factory:
#
#     uvicorn notes.shared.api.main:create_app --factory
