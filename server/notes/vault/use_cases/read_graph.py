from dataclasses import dataclass

from notes.vault.graph import Graph, build_graph
from notes.vault.ports import NoteRepository


@dataclass(frozen=True)
class ReadGraphCommand:
    viewer: str | None


class ReadGraphUseCase:
    """The visible vault as a folder-tree graph — the home page's and the
    prompt's. See vault/graph.py."""

    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: ReadGraphCommand) -> Graph:
        return build_graph(await self._notes.outline(command.viewer))
