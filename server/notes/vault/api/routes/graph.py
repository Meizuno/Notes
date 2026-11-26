from fastapi import APIRouter, Depends

from notes.auth.api.security import get_viewer
from notes.vault.api.dependencies import get_read_graph_use_case
from notes.vault.api.schemas import GraphResponse
from notes.vault.use_cases.read_graph import ReadGraphCommand, ReadGraphUseCase

router = APIRouter(tags=["notes"])


@router.get("/graph")
async def read_graph(
    viewer: str | None = Depends(get_viewer),
    read_graph: ReadGraphUseCase = Depends(get_read_graph_use_case),
) -> GraphResponse:
    """The home page's graph: `{nodes: [{id, slug?, title, type, folder,
    links}], edges: [{source, target}]}`. See vault/graph.py."""
    return GraphResponse.from_domain(await read_graph.execute(ReadGraphCommand(viewer)))
