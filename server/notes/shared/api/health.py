from pathlib import Path

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse, PlainTextResponse

from notes.shared.api.dependencies import get_settings
from notes.shared.config import Settings

router = APIRouter(tags=["health"])


def _draining(settings: Settings) -> bool:
    """`docker rollout` touches the drain file in the old replica before it
    stops it; answering 503 makes Traefik take it out of the pool while the
    requests already in it finish."""
    return Path(settings.drain_file).exists()


# Both answer GET and HEAD: an uptime monitor reaches for HEAD by default, and
# a 405 reads as the app being down. Neither touches the database or anything
# else — they say whether this process is up, not whether Postgres is.


@router.api_route(
    "/health",
    methods=["GET", "HEAD"],
    response_class=PlainTextResponse,
    include_in_schema=False,
)
async def health(settings: Settings = Depends(get_settings)) -> Response:
    """Forma's probe, and what the image's HEALTHCHECK asks."""
    if _draining(settings):
        return PlainTextResponse("draining", status_code=503)
    return PlainTextResponse("ok")


@router.api_route("/api/health", methods=["GET", "HEAD"], include_in_schema=False)
async def api_health(settings: Settings = Depends(get_settings)) -> Response:
    """What Traefik's load-balancer check probes today, in the Nuxt app's
    shape: `{"status": "ok"}`."""
    if _draining(settings):
        return JSONResponse({"status": "draining"}, status_code=503)
    return JSONResponse({"status": "ok"})
