"""The error taxonomy — the port of test/server/utils/errors.test.ts.

There it mattered that the errors were h3 errors, so Nitro rendered their
status. Here it matters that the handlers render them, in Nitro's shape."""

import pytest

from notes.auth.exceptions import Unauthorized
from notes.shared.exceptions import DomainError
from notes.vault.exceptions import NoteNotFound
from tests.conftest import sign_in


class TestDomainErrors:
    def test_note_not_found_carries_a_404_and_the_key_in_its_message(self):
        error = NoteNotFound("abc")
        assert error.status == 404
        assert error.status_message == "Note not found"
        assert type(error).__name__ == "NoteNotFound"
        assert "abc" in error.message
        assert isinstance(error, DomainError)

    def test_note_not_found_without_a_key(self):
        assert NoteNotFound().message == "Note not found"

    def test_unauthorized_carries_a_401(self):
        error = Unauthorized()
        assert error.status == 401
        assert error.status_message == "Unauthorized"
        assert type(error).__name__ == "Unauthorized"


@pytest.mark.usefixtures("pool")
class TestRenderedTheWayNitroRenderedThem:
    async def test_a_missing_note(self, client):
        response = await client.get("/api/notes/nope")
        assert response.status_code == 404
        assert response.json() == {
            "error": True,
            "url": "http://testserver/api/notes/nope",
            "statusCode": 404,
            "statusMessage": "Note not found",
            "message": "Note nope not found",
            "code": "not_found",
        }
        # The headers Nitro sent with every error.
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["cache-control"] == "no-cache"

    async def test_a_request_without_a_session(self, client):
        response = await client.get("/api/auth/me")
        assert response.status_code == 401
        body = response.json()
        assert (body["statusMessage"], body["message"]) == (
            "Unauthorized",
            "Unauthorized",
        )

    async def test_a_validation_failure_is_400_with_its_issues(self, client):
        await sign_in(client, "dev@example.com")
        response = await client.post("/api/notes", json={"title": "   "})
        assert response.status_code == 400
        body = response.json()
        assert body["statusMessage"] == "Validation Error"
        assert body["data"]["issues"][0]["path"] == ["title"]
        assert "Title is required" in body["message"]

    async def test_an_unknown_api_path(self, client):
        response = await client.get("/api/nothing-here")
        assert response.status_code == 404
        assert response.json()["statusMessage"] == "Page not found: /api/nothing-here"

    async def test_the_forwarded_host_and_protocol_make_the_url(self, client):
        response = await client.get(
            "/api/notes/x",
            headers={
                "x-forwarded-host": "notes.example.com",
                "x-forwarded-proto": "https",
            },
        )
        assert response.json()["url"] == "https://notes.example.com/api/notes/x"
