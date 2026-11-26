"""In-memory stand-ins for the ports, so use-case tests do no I/O.

Each implements the same Protocol the SQL adapter does (tests/contracts holds
them to it). Where the SQL carries a rule of its own — the visibility scope,
the folder boundary, the slug index counting deleted rows — the fake carries
it too, or a use-case test would pass against behaviour production does not
have.
"""

import re
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

from notes.auth.models import Account, RefreshToken, TokenPair
from notes.token.models import ApiToken, TokenOwner
from notes.vault.exceptions import SlugTaken
from notes.vault.models import (
    Criteria,
    Note,
    NoteChanges,
    NoteDraft,
    NoteListItem,
    NotePage,
    NoteSummary,
    Visibility,
)

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


class FakeClock:
    def __init__(self, now: datetime | None = None) -> None:
        self._now = now or datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta


class FakeRandomTokens:
    def __init__(self) -> None:
        self._issued = 0

    def token(self) -> str:
        self._issued += 1
        return f"random-{self._issued}"


class FakeLogger:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []

    def _record(self, event: str, **fields: object) -> None:
        self.events.append((event, fields))

    def debug(self, event: str, **fields: Any) -> None:
        self._record(event, **fields)

    def info(self, event: str, **fields: Any) -> None:
        self._record(event, **fields)

    def warning(self, event: str, **fields: Any) -> None:
        self._record(event, **fields)

    def error(self, event: str, **fields: Any) -> None:
        self._record(event, **fields)

    def exception(self, event: str, **fields: Any) -> None:
        self._record(event, **fields)


# ── vault ────────────────────────────────────────────────────────────────────


class StoredNote:
    """A row: the note plus what no reader is shown."""

    def __init__(self, note: Note, owner: str, *, deleted: bool = False) -> None:
        self.note = note
        self.owner = owner
        self.deleted = deleted


class FakeNoteRepository:
    def __init__(self, clock: FakeClock | None = None) -> None:
        self.rows: list[StoredNote] = []
        self._clock = clock or FakeClock()
        # What the last calls were asked, for tests that assert the scope.
        self.updates: list[tuple[str, str, NoteChanges]] = []
        self.deletes: list[tuple[str, str]] = []
        self.searches: list[tuple[str | None, Criteria]] = []
        # A slug a concurrent create takes just before ours, once.
        self.race_for: set[str] = set()
        # Raised by update, to prove the use case does not swallow it.
        self.fail_update_with: Exception | None = None

    # The rule, again — the same one vault/repositories.py writes in SQL.
    @staticmethod
    def _visible(row: StoredNote, viewer: str | None, *, by_link: bool = False) -> bool:
        if row.deleted:
            return False
        note = row.note
        if by_link and note.is_shared:
            return True
        if viewer is None:
            return note.visibility is Visibility.PUBLIC
        return note.visibility is not Visibility.PRIVATE or row.owner == viewer

    @staticmethod
    def _matches(row: StoredNote, key: str) -> bool:
        return row.note.slug == key or (bool(_UUID.match(key)) and row.note.id == key)

    @staticmethod
    def _in_folder(note: Note, folder: str) -> bool:
        folder = folder.rstrip("/") or folder
        return note.folder == folder or (note.folder or "").startswith(folder + "/")

    def add(
        self,
        *,
        slug: str,
        owner: str = "seed-user",
        title: str | None = None,
        folder: str | None = None,
        content: str = "",
        visibility: Visibility = Visibility.PROTECTED,
        is_shared: bool = False,
        deleted: bool = False,
    ) -> Note:
        self._clock.advance(timedelta(seconds=1))
        now = self._clock.now()
        note = Note(
            id=str(uuid.uuid4()),
            slug=slug,
            title=title or slug,
            folder=folder,
            description=None,
            content=content,
            visibility=visibility,
            is_shared=is_shared,
            created_at=now,
            updated_at=now,
        )
        self.rows.append(StoredNote(note, owner, deleted=deleted))
        return note

    async def search(self, viewer: str | None, criteria: Criteria) -> NotePage:
        self.searches.append((viewer, criteria))
        found = [r.note for r in self.rows if self._visible(r, viewer)]
        if criteria.search:
            needle = criteria.search.lower()
            found = [
                n
                for n in found
                if needle in n.title.lower() or needle in n.content.lower()
            ]
        if criteria.folder:
            found = [n for n in found if self._in_folder(n, criteria.folder)]
        found.sort(key=lambda n: n.updated_at, reverse=True)
        window = found[criteria.offset :]
        if criteria.limit is not None:
            window = window[: criteria.limit]
        items = [
            NoteListItem(
                id=n.id,
                slug=n.slug,
                title=n.title,
                folder=n.folder,
                content=n.content,
                visibility=n.visibility,
                updated_at=n.updated_at,
            )
            for n in window
        ]
        return NotePage(items=items, total=len(found))

    async def outline(self, viewer: str | None) -> list[NoteSummary]:
        notes = sorted(
            (r.note for r in self.rows if self._visible(r, viewer)),
            key=lambda n: n.created_at,
        )
        return [
            NoteSummary(
                id=n.id,
                slug=n.slug,
                title=n.title,
                folder=n.folder,
                created_at=n.created_at,
                updated_at=n.updated_at,
            )
            for n in notes
        ]

    async def find(
        self, viewer: str | None, key: str, *, by_link: bool = False
    ) -> Note | None:
        for row in self.rows:
            if self._matches(row, key) and self._visible(row, viewer, by_link=by_link):
                return row.note
        return None

    async def slug_taken(self, slug: str) -> bool:
        # Every row, deleted ones too: the unique index does not care.
        return any(row.note.slug == slug for row in self.rows)

    async def create(self, owner: str, slug: str, draft: NoteDraft) -> Note:
        if slug in self.race_for:
            self.race_for.discard(slug)
            self.add(slug=slug, owner="somebody-else")
            raise SlugTaken(f"slug {slug} was taken")
        if await self.slug_taken(slug):
            raise SlugTaken(f"slug {slug} was taken")
        self._clock.advance(timedelta(seconds=1))
        now = self._clock.now()
        note = Note(
            id=str(uuid.uuid4()),
            slug=slug,
            title=draft.title,
            folder=draft.folder,
            description=draft.description,
            content=draft.content,
            visibility=draft.visibility,
            is_shared=draft.is_shared,
            created_at=now,
            updated_at=now,
        )
        self.rows.append(StoredNote(note, owner))
        return note

    async def update(self, viewer: str, key: str, changes: NoteChanges) -> Note | None:
        self.updates.append((viewer, key, changes))
        if self.fail_update_with is not None:
            raise self.fail_update_with
        for row in self.rows:
            if self._matches(row, key) and self._visible(row, viewer):
                self._clock.advance(timedelta(seconds=1))
                fields: dict[str, Any] = dict(changes.written())
                row.note = replace(row.note, **fields, updated_at=self._clock.now())
                return row.note
        return None

    async def soft_delete(self, viewer: str, key: str) -> bool:
        self.deletes.append((viewer, key))
        for row in self.rows:
            if self._matches(row, key) and self._visible(row, viewer):
                row.deleted = True
                return True
        return False


# ── auth ─────────────────────────────────────────────────────────────────────


class FakeAccountRepository:
    def __init__(self) -> None:
        self.accounts: dict[str, Account] = {}

    def add(self, user_id: str, email: str, name: str | None = None) -> Account:
        account = Account(id=user_id, email=email, name=name)
        self.accounts[user_id] = account
        return account

    async def find_by_id(self, user_id: str) -> Account | None:
        return self.accounts.get(user_id)

    async def find_by_email(self, email: str) -> Account | None:
        return next((a for a in self.accounts.values() if a.email == email), None)

    async def create(
        self, email: str, name: str | None, picture: str | None
    ) -> Account:
        account = Account(id=str(uuid.uuid4()), email=email, name=name, picture=picture)
        self.accounts[account.id] = account
        return account

    async def update_profile(
        self, user_id: str, name: str | None, picture: str | None
    ) -> Account | None:
        account = self.accounts.get(user_id)
        if account is None:
            return None
        account.name = name if name is not None else account.name
        account.picture = picture if picture is not None else account.picture
        return account


class FakeRefreshTokenRepository:
    def __init__(self, clock: FakeClock | None = None) -> None:
        self.tokens: list[RefreshToken] = []
        self._next = 0
        self._clock = clock or FakeClock()

    async def create(self, token: RefreshToken) -> RefreshToken:
        self._next += 1
        token.id = self._next
        token.family = token.family or f"family-{self._next}"
        self.tokens.append(token)
        return token

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None:
        return next((t for t in self.tokens if t.token_hash == token_hash), None)

    async def mark_used(self, token_id: int) -> bool:
        now = self._clock.now()
        for token in self.tokens:
            if (
                token.id == token_id
                and token.used_at is None
                and token.revoked_at is None
                and token.expires_at > now
            ):
                token.used_at = now
                return True
        return False

    async def revoke_family(self, family: str) -> None:
        for token in self.tokens:
            if token.family == family and token.revoked_at is None:
                token.revoked_at = self._clock.now()


class FakeSessionIssuer:
    def __init__(self) -> None:
        self.issued: list[tuple[str, str, str]] = []

    async def issue(
        self, user_id: str, *, family: str = "", user_agent: str = ""
    ) -> TokenPair:
        self.issued.append((user_id, family, user_agent))
        n = len(self.issued)
        return TokenPair(access_token=f"access-{n}", refresh_token=f"refresh-{n}")


# ── token ────────────────────────────────────────────────────────────────────


class FakeTokenRepository:
    def __init__(self, clock: FakeClock | None = None) -> None:
        self.tokens: list[tuple[ApiToken, str]] = []
        self.emails: dict[str, str] = {}
        self._clock = clock or FakeClock()

    async def create(
        self,
        user_id: str,
        name: str,
        token_hash: str,
        expires_at: datetime | None,
    ) -> ApiToken:
        token = ApiToken(
            id=len(self.tokens) + 1,
            user_id=user_id,
            name=name,
            created_at=self._clock.now(),
            expires_at=expires_at,
        )
        self.tokens.append((token, token_hash))
        return token

    async def list_for_user(self, user_id: str) -> list[ApiToken]:
        live = [
            t for t, _ in self.tokens if t.user_id == user_id and t.revoked_at is None
        ]
        return sorted(live, key=lambda t: t.id, reverse=True)

    async def revoke(self, user_id: str, token_id: int) -> bool:
        for token, _ in self.tokens:
            if (
                token.id == token_id
                and token.user_id == user_id
                and not token.revoked_at
            ):
                token.revoked_at = self._clock.now()
                return True
        return False

    async def resolve(self, token_hash: str) -> TokenOwner | None:
        now = self._clock.now()
        for token, stored in self.tokens:
            if stored != token_hash or token.revoked_at is not None:
                continue
            if token.expires_at is not None and token.expires_at <= now:
                continue
            token.last_used_at = now
            return TokenOwner(
                user_id=token.user_id, email=self.emails.get(token.user_id, "")
            )
        return None
