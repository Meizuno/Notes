"""The WHERE builder — where the visibility rule is written, once.

The port of the where-clause cases in test/server/utils/notes.test.ts
(noteVisibilityWhere, noteByIdReadableWhere, noteKeyWhere, and the
AND-wrapping of listNotesScoped). There they asserted Prisma `where`
objects; here the SQL and its parameters. What the SQL MEANS is proved
against Postgres in tests/vault/repositories/.
"""

from notes.vault.models import Criteria
from notes.vault.repositories import (
    Params,
    criteria_match,
    escape_like,
    folder_match,
    key_match,
    search_match,
    visible_to,
)


class TestVisibleTo:
    def test_restricts_anonymous_viewers_to_public_non_deleted_notes(self):
        params = Params()
        assert (
            visible_to(None, params) == "is_deleted = false AND (visibility = 'PUBLIC')"
        )
        assert params.values == []

    def test_lets_a_viewer_see_shared_notes_plus_only_their_own_private_ones(self):
        params = Params()
        assert visible_to("user-1", params) == (
            "is_deleted = false AND (visibility <> 'PRIVATE'"
            " OR (visibility = 'PRIVATE' AND user_id = $1))"
        )
        # The private branch is keyed to user-1, so another user's PRIVATE
        # note can never match — the core cross-user isolation guarantee.
        assert params.values == ["user-1"]


class TestByLink:
    """noteByIdReadableWhere."""

    def test_lets_anonymous_read_public_or_any_shared_note(self):
        assert visible_to(None, Params(), by_link=True) == (
            "is_deleted = false AND (visibility = 'PUBLIC' OR is_shared)"
        )

    def test_adds_the_shared_escape_to_the_viewer_tier(self):
        params = Params()
        assert visible_to("user-1", params, by_link=True) == (
            "is_deleted = false AND (visibility <> 'PRIVATE'"
            " OR (visibility = 'PRIVATE' AND user_id = $1) OR is_shared)"
        )


class TestKeyMatch:
    def test_matches_a_normal_slug_by_slug_only(self):
        params = Params()
        assert key_match("ddd-overview", params) == "slug = $1"
        assert params.values == ["ddd-overview"]

    def test_matches_a_uuid_key_by_slug_or_id(self):
        uuid = "b5636819-edc4-491c-a492-a4719f332a2c"
        params = Params()
        assert key_match(uuid, params) == "(slug = $1 OR id = $2::uuid)"
        assert params.values == [uuid, uuid]


class TestCriteria:
    def test_search_is_and_wrapped_so_it_cannot_widen_the_visibility_or(self):
        params = Params()
        where = criteria_match("u1", Criteria(search="foo", folder="F"), params)
        assert where == (
            "is_deleted = false AND (visibility <> 'PRIVATE'"
            " OR (visibility = 'PRIVATE' AND user_id = $1))"
            " AND (title ILIKE $2 OR content ILIKE $2)"
            " AND (folder = $3 OR folder LIKE $4)"
        )
        assert params.values == ["u1", "%foo%", "F", "F/%"]

    def test_the_folder_filter_stops_at_a_path_boundary(self):
        # The fix: "Programming" no longer takes "Programming2".
        params = Params()
        assert folder_match("Programming/", params) == "(folder = $1 OR folder LIKE $2)"
        assert params.values == ["Programming", "Programming/%"]

    def test_wildcards_in_the_text_mean_themselves(self):
        assert escape_like("100%_a\\b") == "100\\%\\_a\\\\b"
        params = Params()
        search_match("50%", params)
        assert params.values == ["%50\\%%"]
