"""The note's rules — makeNoteSnippet and buildNoteUpdateData from
test/server/utils/notes.test.ts, and the create defaults createNote applied."""

import pytest

from notes.vault.exceptions import InvalidNote, TitleRequired
from notes.vault.models import (
    UNSET,
    NoteChanges,
    Visibility,
    changes_from,
    draft_from,
    make_snippet,
)


class TestMakeSnippet:
    def test_returns_none_for_empty_content(self):
        assert make_snippet("") is None

    def test_windows_around_the_first_search_match(self):
        assert "WORLD" in (make_snippet("hello WORLD foo", "world") or "")

    def test_falls_back_to_a_leading_slice_with_no_or_unmatched_search(self):
        assert make_snippet("abc") == "abc"
        assert make_snippet("abc", "zzz") == "abc"

    def test_the_window_is_forty_either_side_with_ellipses(self):
        content = "a" * 100 + "NEEDLE" + "b" * 100
        snippet = make_snippet(content, "needle")
        assert snippet == "…" + "a" * 40 + "NEEDLE" + "b" * 40 + "…"

    def test_the_leading_slice_is_120_trimmed(self):
        content = "  " + "x" * 200
        assert make_snippet(content) == "x" * 118 + "…"


class TestChangesFrom:
    """buildNoteUpdateData."""

    def test_writes_present_keys_only_trims_title_collapses_empty_folder_and_text(
        self,
    ):
        assert changes_from(title="  New  ", folder="", description="  ").written() == {
            "title": "New",
            "folder": None,
            "description": None,
        }
        assert changes_from().written() == {}

    def test_writes_is_shared_when_explicitly_present(self):
        assert changes_from(is_shared=True).written() == {"is_shared": True}
        assert changes_from(is_shared=False).written() == {"is_shared": False}

    def test_forces_is_shared_on_a_change_to_public_even_against_a_false_flag(self):
        expected = {"visibility": Visibility.PUBLIC, "is_shared": True}
        assert changes_from(visibility=Visibility.PUBLIC).written() == expected
        assert (
            changes_from(visibility=Visibility.PUBLIC, is_shared=False).written()
            == expected
        )

    def test_a_null_folder_clears_it(self):
        assert changes_from(folder=None).written() == {"folder": None}

    def test_an_empty_title_is_refused(self):
        with pytest.raises(TitleRequired):
            changes_from(title="   ")

    def test_unset_is_not_none(self):
        assert NoteChanges(folder=UNSET).written() == {}


class TestDraftFrom:
    """What createNote wrote into the row."""

    def test_collapses_empty_folder_and_description_and_forces_shared_for_public(self):
        draft = draft_from(
            title="Hello",
            content="body",
            folder="",
            description=None,
            visibility=Visibility.PUBLIC,
            is_shared=False,
        )
        assert (draft.folder, draft.description, draft.is_shared) == (None, None, True)

    def test_passes_is_shared_through_for_a_non_public_note(self):
        draft = draft_from(title="x", visibility=Visibility.PROTECTED, is_shared=True)
        assert draft.is_shared is True

    def test_defaults(self):
        draft = draft_from(title="  Hello ")
        assert draft.title == "Hello"
        assert draft.content == ""
        assert draft.visibility is Visibility.PROTECTED
        assert draft.is_shared is False

    def test_limits_count_as_javascript_counted(self):
        draft_from(title="a" * 300)
        with pytest.raises(InvalidNote):
            draft_from(title="😀" * 151)
        with pytest.raises(InvalidNote):
            draft_from(title="ok", folder="f" * 501)
