"""The request shapes — the port of test/shared/schemas/note.test.ts."""

from typing import get_args

import pytest
from pydantic import ValidationError

from notes.vault.api.schemas import (
    ListNotesQuery,
    NoteCreate,
    NoteUpdate,
    VisibilityName,
)
from notes.vault.models import UNSET


class TestCreateNoteSchema:
    def test_fills_defaults_and_trims_the_title(self):
        parsed = NoteCreate.model_validate({"title": "  Hello  "})
        assert parsed.title == "Hello"
        assert parsed.content == ""
        assert parsed.visibility == "PROTECTED"
        assert parsed.is_shared is False

    def test_rejects_an_empty_or_whitespace_only_title(self):
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "   "})
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({})

    def test_rejects_a_title_over_300_chars_and_an_unknown_visibility(self):
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "a" * 301})
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "ok", "visibility": "SECRET"})

    def test_is_strict_where_zod_was(self):
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": 5})
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "ok", "is_shared": "yes"})
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "ok", "content": None})

    def test_trims_folder_and_description_and_drops_unknown_keys(self):
        parsed = NoteCreate.model_validate(
            {"title": "t", "folder": " A/B ", "description": " d ", "user_id": "x"}
        )
        assert (parsed.folder, parsed.description) == ("A/B", "d")
        assert "user_id" not in parsed.model_dump()


class TestUpdateNoteSchema:
    def test_accepts_an_empty_object(self):
        parsed = NoteUpdate.model_validate({})
        assert parsed.model_fields_set == set()

    def test_keeps_only_the_provided_keys(self):
        parsed = NoteUpdate.model_validate({"folder": " work "})
        assert parsed.model_fields_set == {"folder"}
        assert parsed.given("folder") == "work"
        assert parsed.given("title") is UNSET

    def test_allows_folder_to_be_set_to_null_explicitly(self):
        parsed = NoteUpdate.model_validate({"folder": None})
        assert parsed.given("folder") is None

    def test_accepts_the_is_shared_toggle(self):
        assert NoteUpdate.model_validate({"is_shared": True}).given("is_shared") is True
        with pytest.raises(ValidationError):
            NoteUpdate.model_validate({"is_shared": "yes"})

    @pytest.mark.parametrize("field", ["title", "content", "visibility", "is_shared"])
    def test_refuses_null_where_zod_was_optional_but_not_nullable(self, field):
        with pytest.raises(ValidationError):
            NoteUpdate.model_validate({field: None})


class TestListNotesQuerySchema:
    def test_applies_defaults_when_the_query_is_empty(self):
        parsed = ListNotesQuery.model_validate({})
        assert parsed.model_dump() == {
            "search": "",
            "folder": "",
            "limit": 20,
            "offset": 0,
        }

    def test_coerces_numeric_strings_and_caps_the_limit(self):
        parsed = ListNotesQuery.model_validate({"limit": "50", "offset": "10"})
        assert (parsed.limit, parsed.offset) == (50, 10)
        with pytest.raises(ValidationError):
            ListNotesQuery.model_validate({"limit": "500"})

    @pytest.mark.parametrize(
        "query", [{"limit": "0"}, {"limit": "abc"}, {"limit": "1.5"}, {"offset": "-1"}]
    )
    def test_refuses_what_zod_refused(self, query):
        with pytest.raises(ValidationError):
            ListNotesQuery.model_validate(query)

    def test_trims_search_and_folder(self):
        parsed = ListNotesQuery.model_validate({"search": "  vue ", "folder": " P "})
        assert (parsed.search, parsed.folder) == ("vue", "P")


class TestVisibilitySchema:
    def test_accepts_the_three_known_tiers_and_rejects_others(self):
        assert get_args(VisibilityName) == ("PRIVATE", "PROTECTED", "PUBLIC")
        assert (
            NoteCreate.model_validate({"title": "t", "visibility": "PUBLIC"}).visibility
            == "PUBLIC"
        )
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({"title": "t", "visibility": "public"})
