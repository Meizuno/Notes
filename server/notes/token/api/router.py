from fastapi import APIRouter

from notes.token.api.routes import tokens

router = APIRouter()
router.include_router(tokens.router)
