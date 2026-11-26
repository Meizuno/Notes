"""The note use cases against the fake — the port of
test/server/services/notes.test.ts and the scoped-CRUD and uniqueNoteSlug
cases of test/server/utils/notes.test.ts.

What was "throws Unauthorized when the caller is anonymous" there is a gate
here: a use case that writes takes a user id, never None, and the API test
(tests/vault/api) proves an anonymous request never reaches it.
"""

import pytest

from notes.vault.exceptions import NoteNotFound, SlugTaken, TitleRequired
from notes.vault.models import Criteria, Visibility
from notes.vault.use_cases.create_note import (
    SLUG_ATTEMPTS,
    CreateNoteCommand,
    CreateNoteUseCase,
)
from notes.vault.use_cases.delete_note import DeleteNoteCommand, DeleteNoteUseCase
from notes.vault.use_cases.find_published_note import (
    FindPublishedNoteCommand,
    FindPublishedNoteUseCase,
)
from notes.vault.use_cases.list_notes import ListNotesCommand, ListNotesUseCase
from notes.vault.use_cases.list_pages import ListPagesCommand, ListPagesUseCase
from notes.vault.use_cases.read_graph import ReadGraphCommand, ReadGraphUseCase
from notes.vault.use_cases.read_note import ReadNoteCommand, ReadNoteUseCase
from notes.vault.use_cases.read_tree import ReadTreeCommand, ReadTreeUseCase
from notes.vault.use_cases.update_note import UpdateNoteCommand, UpdateNoteUseCase
from tests.fakes import FakeNoteRepository


@pytest.fixture
def notes():
    return FakeNoteRepository()


class TestCreateNote:
    async def test_stamps_creator_collapses_empty_fields_forces_shared_for_public(
        self, notes
    ):
        note = await CreateNoteUseCase(notes).execute(
            CreateNoteCommand(
                owner="u1",
                title="Hello",
                content="body",
                folder="",
                description=None,
                visibility=Visibility.PUBLIC,
                # even though the client sent false, PUBLIC forces it true
                is_shared=False,
            )
        )
        row = notes.rows[-1]
        assert row.owner == "u1"
        assert (note.slug, note.title, note.content) == ("hello", "Hello", "body")
        assert (note.folder, note.description) == (None, None)
        assert (note.visibility, note.is_shared) == (Visibility.PUBLIC, True)

    async def test_passes_is_shared_through_for_a_non_public_note(self, notes):
        note = await CreateNoteUseCase(notes).execute(
            CreateNoteCommand(
                owner="u1",
                title="Shared protected",
                visibility=Visibility.PROTECTED,
                is_shared=True,
            )
        )
        assert (note.visibility, note.is_shared) == (Visibility.PROTECTED, True)

    async def test_refuses_an_empty_title(self, notes):
        with pytest.raises(TitleRequired):
            await CreateNoteUseCase(notes).execute(
                CreateNoteCommand(owner="u1", title=" ")
            )
        assert notes.rows == []


class TestUniqueSlug:
    async def test_returns_the_base_slug_when_free(self, notes):
        assert (
            await CreateNoteUseCase(notes).unique_slug("DDD Overview") == "ddd-overview"
        )

    async def test_appends_2_3_until_a_free_slug_is_found(self, notes):
        notes.add(slug="ddd-overview")
        notes.add(slug="ddd-overview-2", deleted=True)  # deleted rows keep theirs
        assert (
            await CreateNoteUseCase(notes).unique_slug("DDD Overview")
            == "ddd-overview-3"
        )

    async def test_skips_a_reserved_base_slug(self, notes):
        # 'New' → 'new' is reserved → 'new-2', so a note never shadows /new.
        assert await CreateNoteUseCase(notes).unique_slug("New") == "new-2"

    async def test_a_slug_taken_by_a_concurrent_create_is_retried(self, notes):
        notes.race_for.add("hello")
        note = await CreateNoteUseCase(notes).execute(
            CreateNoteCommand(owner="u1", title="Hello")
        )
        assert note.slug == "hello-2"

    async def test_gives_up_after_a_few_lost_races(self, notes):
        notes.race_for.update(
            ["hello", *(f"hello-{n}" for n in range(2, SLUG_ATTEMPTS + 2))]
        )
        with pytest.raises(SlugTaken):
            await CreateNoteUseCase(notes).execute(
                CreateNoteCommand(owner="u1", title="Hello")
            )


class TestUpdateNote:
    async def test_writes_only_the_provided_trimmed_keys_within_the_viewer_scope(
        self, notes
    ):
        notes.add(slug="my-note", folder="Old")
        note = await UpdateNoteUseCase(notes).execute(
            UpdateNoteCommand(viewer="u1", key="my-note", title="  New  ", folder="")
        )
        viewer, key, changes = notes.updates[-1]
        assert (viewer, key) == ("u1", "my-note")
        assert changes.written() == {"title": "New", "folder": None}
        assert (note.title, note.folder) == ("New", None)

    async def test_raises_not_found_when_nothing_matched_the_scope(self, notes):
        notes.add(slug="theirs", owner="u2", visibility=Visibility.PRIVATE)
        with pytest.raises(NoteNotFound):
            await UpdateNoteUseCase(notes).execute(
                UpdateNoteCommand(viewer="u1", key="theirs", title="x")
            )

    async def test_re_raises_anything_else(self, notes):
        notes.add(slug="n1")
        boom = RuntimeError("boom")
        notes.fail_update_with = boom
        with pytest.raises(RuntimeError) as raised:
            await UpdateNoteUseCase(notes).execute(
                UpdateNoteCommand(viewer="u1", key="n1", title="x")
            )
        assert raised.value is boom

    async def test_a_note_shared_by_link_is_not_editable_by_a_stranger_with_the_link(
        self, notes
    ):
        notes.add(
            slug="draft", owner="bob", visibility=Visibility.PRIVATE, is_shared=True
        )
        with pytest.raises(NoteNotFound):
            await UpdateNoteUseCase(notes).execute(
                UpdateNoteCommand(viewer="alice", key="draft", title="mine now")
            )


class TestDeleteNote:
    async def test_soft_deletes_for_the_viewer_and_returns_the_key(self, notes):
        notes.add(slug="n1")
        assert (
            await DeleteNoteUseCase(notes).execute(
                DeleteNoteCommand(viewer="u1", key="n1")
            )
            == "n1"
        )
        assert notes.rows[0].deleted

    async def test_raises_not_found_when_nothing_matched_the_scope(self, notes):
        with pytest.raises(NoteNotFound):
            await DeleteNoteUseCase(notes).execute(
                DeleteNoteCommand(viewer="u1", key="gone")
            )


class TestReads:
    async def test_list_passes_the_viewer_and_criteria_through(self, notes):
        criteria = Criteria(search="", folder="", limit=20, offset=0)
        await ListNotesUseCase(notes).execute(
            ListNotesCommand(viewer="u1", criteria=criteria)
        )
        assert notes.searches == [("u1", criteria)]

    async def test_anonymous_lists_public_only(self, notes):
        notes.add(slug="pub", visibility=Visibility.PUBLIC)
        notes.add(slug="prot")
        page = await ListNotesUseCase(notes).execute(
            ListNotesCommand(viewer=None, criteria=Criteria())
        )
        assert [n.slug for n in page.items] == ["pub"]

    async def test_read_by_link_opens_a_shared_note_and_nothing_else(self, notes):
        notes.add(
            slug="draft", owner="bob", visibility=Visibility.PRIVATE, is_shared=True
        )
        read = ReadNoteUseCase(notes)
        assert (
            await read.execute(ReadNoteCommand(None, "draft", by_link=True))
        ).slug == "draft"
        with pytest.raises(NoteNotFound):
            await read.execute(ReadNoteCommand(None, "draft"))

    async def test_published_means_anybody_may_read_it(self, notes):
        notes.add(slug="pub", visibility=Visibility.PUBLIC)
        notes.add(slug="prot")
        find = FindPublishedNoteUseCase(notes)
        assert await find.execute(FindPublishedNoteCommand("pub")) is not None
        assert await find.execute(FindPublishedNoteCommand("prot")) is None

    async def test_tree_graph_and_pages_share_the_scope(self, notes):
        notes.add(slug="a", folder="F")
        notes.add(slug="b", owner="bob", visibility=Visibility.PRIVATE)
        tree = await ReadTreeUseCase(notes).execute(ReadTreeCommand("alice"))
        graph = await ReadGraphUseCase(notes).execute(ReadGraphCommand("alice"))
        pages = await ListPagesUseCase(notes).execute(ListPagesCommand("alice"))
        assert [n.slug for n in tree] == ["a"]
        assert [n.id for n in graph.nodes] == ["folder:F", tree[0].id]
        assert [n.slug for n in pages] == ["a"]

    async def test_pages_are_newest_updated_first(self, notes):
        notes.add(slug="old")
        notes.add(slug="new-one")
        pages = await ListPagesUseCase(notes).execute(ListPagesCommand("u"))
        assert [n.slug for n in pages] == ["new-one", "old"]
