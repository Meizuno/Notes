from fastapi import APIRouter

from notes.auth.api.routes import dev, google, session

# Each route module owns its own APIRouter with the /auth prefix; this
# aggregator stitches them together so main.py imports one symbol.
router = APIRouter()
router.include_router(session.router)
router.include_router(google.router)
router.include_router(dev.router)
