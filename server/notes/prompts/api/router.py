from fastapi import APIRouter

from notes.prompts.api.routes import notes

router = APIRouter()
router.include_router(notes.router)
