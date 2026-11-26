"""The MCP server ai-chat uses: same tools, same results, as the user the
endpoint resolved — over Streamable HTTP, through the real SDK."""

import json
from typing import Any

import pytest

from notes.mcp.tools import TOOL_SPECS, ToolCallRefused, VaultTools, call_tool
from notes.vault.models import Visibility
from notes.vault.use_cases.create_note import CreateNoteUseCase
from notes.vault.use_cases.delete_note import DeleteNoteUseCase
from notes.vault.use_cases.list_notes import ListNotesUseCase
from notes.vault.use_cases.read_note import ReadNoteUseCase
from notes.vault.use_cases.update_note import UpdateNoteUseCase
from tests.conftest import add_note, add_user, sign_in
from tests.fakes import FakeNoteRepository

# The descriptions are part of the contract: the model reads them.
NUXT_DESCRIPTIONS = {
    "list_notes": (
        "List or search notes in the vault. Optional `query` matches against title "
        "and content (case-insensitive substring, trigram-indexed); optional "
        "`folder` is a slash-separated prefix that also includes nested folders "
        '(e.g. "Programming" matches notes in "Programming/Rust"). Returns items '
        "(id, title, folder, hasContent, updatedAt, visibility, and snippet when a "
        "query matched the content), total count, and hasMore flag. Use get_note "
        "for full content. Default limit is 20."
    ),
    "get_note": (
        "Get full note by id. Returns title, description, content (CommonMark + "
        "GFM markdown), folder path, visibility tier, and timestamps. Returns an "
        "error if the id is not found or refers to a PRIVATE note owned by another "
        "user."
    ),
    "create_note": (
        "Create a new note. `title` is required. `content` is CommonMark + GFM "
        "markdown. `description` is an optional one- or two-sentence summary (max "
        "500 chars). `folder` is a slash-separated path that nests folders "
        'implicitly (e.g. "Programming/Rust"); omit for a root-level note. '
        "`visibility` defaults to PROTECTED. Returns the new note's id and metadata."
    ),
    "update_note": (
        "Update a note by id. Any provided field is set; omitted fields are left "
        "unchanged. Pass `folder: null` or `description: null` to clear those "
        "fields. Returns the updated note. Errors if the id is not found, "
        "soft-deleted, or refers to a PRIVATE note owned by another user."
    ),
    "delete_note": (
        "Soft-delete a note by id. The row stays in the database with "
        "is_deleted=true and disappears from every read endpoint, but can be "
        "recovered manually if needed. Errors if the id is not found, already "
        "deleted, or refers to a PRIVATE note owned by another user."
    ),
}

ACCEPT = {"Accept": "application/json, text/event-stream"}


def _vault(notes: FakeNoteRepository) -> VaultTools:
    return VaultTools(
        list_notes=ListNotesUseCase(notes),
        read_note=ReadNoteUseCase(notes),
        create_note=CreateNoteUseCase(notes),
        update_note=UpdateNoteUseCase(notes),
        delete_note=DeleteNoteUseCase(notes),
    )


class TestTheToolsThemselves:
    def test_names_and_descriptions_are_the_nuxt_ones(self):
        assert {spec.name: spec.description for spec in TOOL_SPECS} == NUXT_DESCRIPTIONS

    def test_update_note_takes_null_for_folder_and_description_only(self):
        schema = next(s for s in TOOL_SPECS if s.name == "update_note").input_schema
        assert schema["required"] == ["id"]
        assert schema["properties"]["folder"]["type"] == ["string", "null"]
        assert schema["properties"]["description"]["anyOf"] == [
            {"type": "string", "maxLength": 500},
            {"type": "null"},
        ]
        assert schema["additionalProperties"] is False

    async def test_list_notes_shape(self):
        notes = FakeNoteRepository()
        notes.add(slug="a", folder="P/Rust", content="hello there", title="A")
        result = await call_tool("list_notes", {"query": "there"}, "u1", _vault(notes))
        assert list(result) == ["items", "total", "hasMore"]
        item = result["items"][0]
        assert list(item) == [
            "id",
            "title",
            "folder",
            "visibility",
            "hasContent",
            "snippet",
            "updatedAt",
        ]
        assert (item["visibility"], item["hasContent"], item["snippet"]) == (
            "PROTECTED",
            True,
            "hello there",
        )

    async def test_the_limit_defaults_to_20_and_caps_at_100(self):
        notes = FakeNoteRepository()
        for n in range(25):
            notes.add(slug=f"n{n}")
        vault = _vault(notes)
        assert len((await call_tool("list_notes", {}, "u", vault))["items"]) == 20
        result = await call_tool("list_notes", {"limit": 500, "offset": 20}, "u", vault)
        assert (len(result["items"]), result["hasMore"]) == (5, False)

    async def test_create_update_delete_results(self):
        notes = FakeNoteRepository()
        vault = _vault(notes)
        created = await call_tool(
            "create_note",
            {
                "title": " Hi ",
                "folder": " ",
                "description": "d",
                "visibility": "PRIVATE",
            },
            "u1",
            vault,
        )
        assert list(created) == [
            "id",
            "title",
            "description",
            "folder",
            "visibility",
            "created_at",
            "updated_at",
        ]
        assert (created["title"], created["folder"], created["visibility"]) == (
            "Hi",
            None,
            "PRIVATE",
        )
        assert notes.rows[0].owner == "u1"

        updated = await call_tool(
            "update_note",
            {"id": created["id"], "folder": "F", "description": None},
            "u1",
            vault,
        )
        assert list(updated) == [
            "id",
            "title",
            "description",
            "folder",
            "visibility",
            "updated_at",
        ]
        assert (updated["folder"], updated["description"]) == ("F", None)

        # PRIVATE, so another user gets "not found" from every tool.
        for tool in ("get_note", "update_note", "delete_note"):
            assert await call_tool(tool, {"id": created["id"]}, "u2", vault) == {
                "error": "Note not found"
            }
        assert await call_tool("delete_note", {"id": created["id"]}, "u1", vault) == {
            "deleted": created["id"]
        }

    async def test_an_empty_title_is_the_tool_error_the_nuxt_one_returned(self):
        vault = _vault(FakeNoteRepository())
        assert await call_tool("create_note", {"title": "   "}, "u", vault) == {
            "error": "Title is required"
        }

    async def test_public_notes_made_through_mcp_are_shared(self):
        notes = FakeNoteRepository()
        await call_tool(
            "create_note", {"title": "x", "visibility": "PUBLIC"}, "u", _vault(notes)
        )
        assert notes.rows[0].note.is_shared is True
        assert notes.rows[0].note.visibility is Visibility.PUBLIC

    @pytest.mark.parametrize(
        ("name", "arguments"),
        [
            ("get_note", {}),
            ("get_note", {"id": 5}),
            ("create_note", {"title": ""}),
            ("create_note", {"title": "t", "description": None}),
            ("create_note", {"title": "t", "visibility": "SECRET"}),
            ("update_note", {"id": "x", "title": None}),
            ("list_notes", {"limit": "ten"}),
        ],
    )
    async def test_arguments_off_the_schema_are_refused(self, name, arguments):
        with pytest.raises(ToolCallRefused, match="Input validation error"):
            await call_tool(name, arguments, "u", _vault(FakeNoteRepository()))

    async def test_an_unknown_tool(self):
        with pytest.raises(ToolCallRefused, match="Tool nope not found"):
            await call_tool("nope", {}, "u", _vault(FakeNoteRepository()))


def _messages(text: str) -> list[dict[str, Any]]:
    return [
        json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")
    ]


async def _rpc(
    client: Any, method: str, params: dict[str, Any] | None = None, **headers: str
) -> Any:
    response = await client.post(
        "/api/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        headers={**ACCEPT, **headers},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    (message,) = _messages(response.text)
    return message["result"]


async def _tool(
    client: Any, name: str, arguments: dict[str, Any], **headers: str
) -> Any:
    result = await _rpc(
        client, "tools/call", {"name": name, "arguments": arguments}, **headers
    )
    (content,) = result["content"]
    assert content["type"] == "text"
    return json.loads(content["text"]), result


@pytest.mark.usefixtures("pool")
class TestOverHttp:
    async def test_needs_a_caller(self, client):
        response = await client.post(
            "/api/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers=ACCEPT,
        )
        assert response.status_code == 401

    async def test_initialize_and_list_the_tools(self, client):
        await sign_in(client, "dev@example.com")
        init = await _rpc(
            client,
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        )
        assert init["serverInfo"] == {"name": "notes", "version": "1.0.0"}
        tools = (await _rpc(client, "tools/list"))["tools"]
        assert [t["name"] for t in tools] == list(NUXT_DESCRIPTIONS)
        list_notes = tools[0]["inputSchema"]
        assert list_notes["properties"]["limit"] == {
            "type": "integer",
            "description": "Max items to return (default 20, max 100).",
        }
        assert list_notes["$schema"] == "http://json-schema.org/draft-07/schema#"

    async def test_tools_run_as_the_token_owner(self, client, pool):
        await add_user(pool, "bob", "bob@example.com")
        await add_note(pool, slug="bob-secret", owner="bob", visibility="PRIVATE")
        await add_note(pool, slug="alice-secret", owner="alice", visibility="PRIVATE")
        await sign_in(client, "bob@example.com")
        raw = (await client.post("/api/tokens", json={"name": "ai-chat"})).json()[
            "token"
        ]
        client.cookies.clear()
        bearer = {"Authorization": f"Bearer {raw}"}

        own, _ = await _tool(client, "get_note", {"id": "bob-secret"}, **bearer)
        assert own["slug"] == "bob-secret"
        assert list(own) == [
            "id",
            "slug",
            "title",
            "folder",
            "description",
            "content",
            "visibility",
            "is_shared",
            "created_at",
            "updated_at",
        ]
        theirs, result = await _tool(
            client, "get_note", {"id": "alice-secret"}, **bearer
        )
        assert theirs == {"error": "Note not found"}
        assert result.get("isError", False) is False

        created, _ = await _tool(
            client, "create_note", {"title": "From chat"}, **bearer
        )
        owner = await pool.fetchval(
            "SELECT user_id FROM notes WHERE id = $1::uuid", created["id"]
        )
        assert owner == "bob"

        listed, _ = await _tool(client, "list_notes", {}, **bearer)
        assert {item["title"] for item in listed["items"]} == {
            "Bob Secret",
            "From chat",
        }

    async def test_a_refused_call_is_an_error_result(self, client):
        await sign_in(client, "dev@example.com")
        result = await _rpc(client, "tools/call", {"name": "get_note", "arguments": {}})
        assert result["isError"] is True
        assert "Input validation error" in result["content"][0]["text"]

    async def test_text_is_compact_json_with_iso_timestamps(self, client, pool):
        await add_note(pool, slug="n", content="é")
        await sign_in(client, "dev@example.com")
        result = await _rpc(
            client, "tools/call", {"name": "list_notes", "arguments": {}}
        )
        text = result["content"][0]["text"]
        assert text.startswith('{"items":[{"id":')
        assert "é" in text  # not escaped, as JSON.stringify did not
        assert json.loads(text)["items"][0]["updatedAt"].endswith("Z")
