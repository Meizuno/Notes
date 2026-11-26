# AGENTS.md — the Python server

Rules for working in `server/`. They are enforced by `ruff check notes scripts
tests` (clean), `mypy notes scripts tests` (strict, clean) and `pytest -W error`
(warnings are failures). Violations break the build.

This server replaced a Nuxt 4 / Nitro one. While the rewrite was under way the
rule was that anything a client or ai-chat could see had to match the Nuxt app
exactly — paths, JSON shapes and key order, status codes, the NDJSON stream,
timestamps spelled as `Date.toISOString()` — and that rule outlives the Nuxt
code: **a client-visible change is a change to the client and to ai-chat as
well.** `git log` has the Nuxt server for a question about why something is
shaped the way it is.

---

## Project at a glance

Python 3.12+, FastAPI, asyncpg, Postgres (with `pg_trgm`). The schema is plain
SQL in `migrations/`, applied on boot. No ORM, no Redis, no background workers.
The shape is the owner's Forma project's, module for module.

A **modular monolith** sliced into modules, each flat — no `domain/` /
`application/` / `infrastructure/` folders. The dependency rule is encoded **by
file**, not by directory.

```
<module>/
├── models.py        ── entities, value objects, the rules about them (framework-free)
├── ports.py         ── every Protocol this module owns (framework-free)
├── exceptions.py    ── DomainError / ApplicationError subclasses
├── repositories.py  ── the port impls: the SQL, and the row → entity mapping
├── use_cases/       ── one file per use case; Command DTO + UseCase together
└── api/             ── FastAPI routes, DI providers, request/response schemas
    ├── __init__.py  ── EMPTY (importing a schema must not import every route)
    ├── router.py    ── the aggregator main.py imports
    ├── dependencies.py
    ├── schemas.py
    └── routes/
```

Modules:

| module | what it owns | endpoints |
|---|---|---|
| `vault/` | the Note: visibility, slugs, the graph | `GET\|POST /api/notes`, `GET\|PUT\|DELETE /api/notes/{key}`, `GET /api/notes/tree`, `GET /api/graph` |
| `auth/` | sign-in (Google, dev), sessions, the allow-list | `/api/auth/google`, `/callback`, `/me`, `/refresh`, `/logout`, `/config`, `/dev` |
| `token/` | personal API tokens for ai-chat | `GET\|POST /api/tokens`, `DELETE /api/tokens/{id}` |
| `prompts/` | ai-chat's "Notes overview" prompt | `GET /api/prompts/notes` |
| `mcp/` | the MCP server for ai-chat | `/api/mcp` (Streamable HTTP) |
| `shared/` | config, pool, migrations, logging, errors, the app factory, pages | `/health`, `/api/health`, `/robots.txt`, `/sitemap.xml`, the SPA |

Files outside the list above, each one idea too long for `models.py`:

| file | what it is |
|---|---|
| `vault/slugs.py` | title → slug, a port of `@sindresorhus/slugify` 3.0.0 |
| `vault/transliteration.py` | its character table — GENERATED, see the file's header |
| `vault/graph.py` | the vault as a folder-tree graph |
| `auth/google.py` | the outbound Google OAuth adapter (not a repository) |
| `auth/use_cases/admit.py` | the allow-list door both sign-ins go through |
| `mcp/tools.py`, `mcp/server.py` | the five tools, and the SDK server that publishes them |
| `shared/text.py` | where JavaScript's string semantics are part of the contract |
| `shared/api/seo.py`, `shared/api/spa.py` | the head and pre-render for crawlers; the page rules |

---

## The Dependency Rule (non-negotiable)

**Source-code dependencies point inward.**

- `models.py` imports nothing else from the module but its `exceptions.py` and
  `shared/` helpers that are pure (`shared/text.py`).
- `ports.py` imports only `models.py`.
- `repositories.py` imports `ports.py`, `models.py`, `exceptions.py`, `shared/`.
  **Only the composition root imports FROM `repositories.py`** — the
  `api/dependencies.py` providers, `mcp/api/endpoint.py`, and the scripts.
- `use_cases/*.py` import `ports.py`, `models.py`, `exceptions.py` and shared
  ports. They **never** import `repositories.py` or `api/`.
- `api/*` orchestrates: use cases, its own schemas, DI providers.

Cross-module imports are one-way and explicit:

- `prompts/` reads notes through the vault's **port** and use cases.
- `mcp/tools.py` builds every tool from a vault **use case** — a tool cannot
  do anything the HTTP API would refuse, for the same reason and in the same
  code.
- The gate (`auth/api/security.py`) accepts an API token without auth/
  importing token/: `auth/ports.py` declares `ApiTokenResolver`, speaking
  primitives, `token/repositories.py` implements it, and
  `shared/api/dependencies.py` bridges them. Use the same asymmetric pattern
  for the next one.

**Hard forbidden:**
- ❌ Importing `repositories.py` from `models.py`, `ports.py` or `use_cases/`
- ❌ SQL, Pydantic or HTTP types in `models.py` or `ports.py`
- ❌ Returning a driver `Record` from a repository — map it to an entity there
- ❌ `datetime.now()` / `secrets.*` in a use case — inject `Clock` / `RandomTokens`
- ❌ Mutable module-level state (app-scoped objects live on `app.state`)
- ❌ `try/except` in routes — let exceptions reach `shared/api/errors.py`. The
  one exception is the Google callback, which turns a failure into a redirect
  because the person arrived by navigation.
- ❌ `# noqa` / `# type: ignore` without an inline reason

---

## The visibility rule lives once

```
anonymous → PUBLIC only
a user    → PUBLIC + PROTECTED + their OWN PRIVATE notes
by link   → also any is_shared note — single reads by URL only
soft-deleted notes are nobody's
```

It is written in exactly one place: `visible_to()` in
`vault/repositories.py`, the WHERE builder every statement in that file is
built from. HTTP, MCP and the prompts all read through `NoteRepository`, so a
new caller cannot forget it. Listings and every write use the tier scope; only
`find(..., by_link=True)` (the note page, `GET /api/notes/{key}`) adds the
shared escape — a shared note is readable by whoever holds its URL, never
listed, never editable by a stranger.

The folder filter stops at a path boundary (`folder = X OR folder LIKE 'X/%'`);
the Nuxt app's bare prefix took "Programming2" with "Programming".

`FakeNoteRepository` in `tests/fakes.py` carries the same rule in Python, so a
use-case test cannot pass against behaviour production does not have.

---

## The database

Production is the database Prisma made, and it must keep working untouched.

- `000001_notes.up.sql` is a **baseline**: exactly the schema the six Prisma
  migrations left (column order included), written idempotently — `IF NOT
  EXISTS` everywhere, the enum in a `DO` block. On production it changes
  nothing; `tests/shared/test_migrations.py` replays the Prisma migrations
  (`tests/fixtures/prisma/`) and proves it. Its down migration refuses.
- `_prisma_migrations` is left alone. The runner is Forma's, with
  golang-migrate's `schema_migrations` and an advisory lock.
- `notes` is `timestamp(3) without time zone` holding UTC. Every write says
  `now() AT TIME ZONE 'UTC'` explicitly, and every update — soft deletes
  included — sets `updated_at` (Prisma did that in its client).
- `notes.user_id` holds the central SSO's user ids. `users.id` is TEXT so that
  `scripts/import_sso_users.py` can bring those users across under the same
  ids; there is deliberately no foreign key from notes to users.

---

## Sign-in

The app's own, ported from Forma's `auth/`, Google only:

- An HS256 access JWT (15 min) and an opaque refresh token stored hashed, with
  rotation, a 20-second reuse grace for concurrent tabs, family revocation on
  replay, and logout revoking the family.
- **Cookies are `notes_access` and `notes_refresh`**, HttpOnly, SameSite=Lax,
  host-only, path `/`. Never `access_token` / `refresh_token`: the SSO still
  sets those on `.meizuno.com`, and a dict of cookies keeps the last of two
  with one name.
- The session renews **in passing**: any request that finds a lapsed access
  token and a live refresh cookie rotates it there. The new pair is written by
  `SessionCookieWriter` as the response head goes out, so it works for JSON,
  the NDJSON stream, redirects, pages and MCP alike. A dependency never writes
  cookies itself — it calls `remember()` / `forget()`.
- **The allow-list** (`NOTES_ALLOWED_EMAILS`) is asked at every door, before
  anything is written, at every renewal, and on every API-token use. Empty
  means nobody.
- `NOTES_DEV_LOGIN=true` enables `GET /api/auth/dev?email=` (the allow-list
  still applies). The server refuses to start with it and `CLIENT_DIR` set.

The gate has three dependencies: `get_viewer` (public reads), `get_user_id`
(401 without a session), `get_caller` (an API token or a session — MCP and the
prompts only). The note writes take `get_viewer` and call `signed_in()` in the
route so the body is validated before the session, as the Nuxt handlers did.

---

## The contract, where it is subtle

- **Errors** render Nitro's body — `{"error", "url", "statusCode",
  "statusMessage", "message", "data"?}` — plus Forma's `code`. Validation
  failures are `400 "Validation Error"` with the issues in `data`.
- **Timestamps** are `shared/text.iso()`: `2026-05-22T12:00:00.260Z`.
- **Lengths and trims** count as JavaScript did (`js_length`, `trim`): zod's
  `.max(300)` counted UTF-16 units.
- **`GET /api/notes`** streams NDJSON: a meta line, then items, 30 ms apart.
- **MCP** tool names, descriptions and input schemas are the Node server's,
  zod-to-json-schema spelling included; results are compact JSON text.
- Slugs are fixed at creation and come from `vault/slugs.py`, which must keep
  giving `tests/vault/slug_cases.json`'s answers.

---

## Tests

| under | what it proves | against |
|---|---|---|
| `tests/<module>/test_*.py` | the rules hold | nothing — pure functions |
| `tests/<module>/use_cases/` | a use case decides correctly | the fakes |
| `tests/<module>/api/`, `repositories/`, `shared/`, `mcp/`, `scripts/` | it works end to end, and the SQL means what it says | Postgres |

**A new fake goes in `tests/contracts/test_ports.py`.** It compares every
implementation of every port against the port's methods and parameter names.

Database tests need `TEST_DATABASE_URL` (the dev stack makes `notes_test`);
without it they skip. They truncate what they use, so never point it at a
database you care about. `make_client(**env)` in `tests/conftest.py` builds the
whole app with any environment on top of a working default.

---

## Mandatory patterns

- **Use cases as classes**: one file per use case,
  `<module>/use_cases/<verb>_<noun>.py`, holding `<Verb><Noun>Command` (a
  frozen dataclass) and `<Verb><Noun>UseCase` with one `async def execute`.
  Constructor injection; no `Depends()` inside.
- **Dependency providers are `async def`**, even the ones that only build an
  object: FastAPI runs a sync dependency in a worker thread.
- **Repositories**: Protocol in `ports.py`, implementation in
  `repositories.py`, methods in domain language; detect "0 rows" with
  `RETURNING` and a `None` check. Values always go as `$n` parameters — the
  only text spliced into SQL is constant column lists and the WHERE builder's
  own fragments (hence the S608 per-file ignore).
- **Errors**: `DomainError` / `ApplicationError` in `shared/exceptions.py`,
  each subclass setting `code`, `status` and `status_message`.
- **Settings**: all in `shared/config.py`, prefix `NOTES_` (plus the bare
  `PORT`, `CLIENT_DIR`, `RUN_MIGRATIONS` the image sets).
  `_refuse_a_broken_environment` lists every problem at once; a setting that
  can be wrong belongs there.
- **No module-level `app`**: the entrypoint is `create_app --factory`.

---

## Commands

| Task | Command |
|---|---|
| Install | `pip install -e ".[dev]"` |
| All gates | `make verify` |
| Tests (warnings are errors) | `TEST_DATABASE_URL=… pytest -W error` |
| Lint / types | `ruff check notes scripts tests` / `mypy notes scripts tests` |
| Run locally | `uvicorn notes.shared.api.main:create_app --factory --reload` |
| Seed (dev only) | `NOTES_DATABASE_URL=… python scripts/seed.py` |
| Import SSO users (cut-over) | `NOTES_DATABASE_URL=… python scripts/import_sso_users.py <sso url> [--dry-run]` |

## Before calling a task done

1. ✅ No layer violations — `use_cases/` imports no `repositories.py` or `api/`
2. ✅ Every note read or write goes through `NoteRepository` and so through `visible_to`
3. ✅ `ruff check notes scripts tests` → "All checks passed!"
4. ✅ `mypy notes scripts tests` → "Success: no issues found"
5. ✅ `pytest -W error` → green
6. ✅ No `datetime.now()` outside `SystemClock`; no `try/except` in a route
7. ✅ Any client-visible shape checked against the client and ai-chat
