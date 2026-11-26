from fastapi import APIRouter

from notes.vault.api.routes import graph, notes

router = APIRouter()
router.include_router(notes.router)
router.include_router(graph.router)
