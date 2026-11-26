from fastapi import APIRouter

from notes.mcp.api import endpoint

router = APIRouter()
router.include_router(endpoint.router)
