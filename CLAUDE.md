# CLAUDE.md

Instructions for AI agents working in this repository.

**Notes** is a self-hosted, multi-user Markdown vault in the spirit of Obsidian:
- notes are grouped into implicit folders and browsable as a force-directed
  graph or a folder tree;
- each note has a visibility tier, `PRIVATE`, `PROTECTED` or `PUBLIC`;
- notes can be shared by link;
- public notes are pre-rendered for search engines;
- there is an MCP endpoint for ai-chat.

The project has the same shape as the owner's other apps (Forma, English): a
**Python server** and a **Vue client**, shipped as one image.

```
server/   Python 3.12 · FastAPI · asyncpg (raw SQL) · pydantic · structlog
          the API, the pages (SPA + SEO pre-render), sign-in, MCP
client/   Vue 3 · Vite · TypeScript · @nuxt/ui v4 (Vite plugin) · Tailwind v4
          the whole interface, built to static files the server serves
Dockerfile        client build → server deps → one runtime image (port 8080)
compose.dev.yaml  Postgres + server (--reload) + Vite, for development
```

## The server

**[server/AGENTS.md](server/AGENTS.md) is binding.** Read it before touching
`server/`. It covers:
- the dependency rule: models → ports → use cases → adapters/api;
- the visibility rule, which lives in exactly one place;
- the database and migrations;
- sign-in and API tokens;
- the subtle parts of the HTTP contract;
- tests and commands.

In short:

- Modules are `shared`, `auth`, `token`, `vault` (notes), `mcp` and `prompts`.
  Each has models, ports, repositories, use_cases and `api/`, as in Forma.
- **Who may read what is decided once,** in `vault/repositories.py`
  (`visible_to`). HTTP, MCP and the prompt endpoint all go through it. Never
  write a second filter.
- Migrations are plain SQL in `server/migrations/`, applied at boot.
  `000001_notes` is the idempotent baseline of the old Prisma schema: production
  data predates this server.
- Sign-in is the app's own: Google only, limited to `NOTES_ALLOWED_EMAILS`.
  ai-chat uses personal API tokens (`notes_pat_…`) as `Authorization: Bearer`.

## The client

- `pages/` are thin. They compose components and call composables.
- `components/` render and emit. They hold no `fetch` and no business logic.
- `composables/use*.ts` hold the stateful logic (`useAuth`, `useNoteEditor`,
  `useVault`, …), one concern each.
- **`lib/api.ts` is the only place that talks to the server.** `lib/http.ts`
  does the 401 → one refresh → retry. `lib/types.ts` mirrors the server's JSON;
  change both sides together.
- **Markdown is rendered only through `lib/markdown.ts`.** It runs marked, then
  the sanitizer, then `lib/prose.ts`. Notes are untrusted user content: never
  put note text into `v-html` any other way, and never loosen `lib/sanitize.ts`
  without a test for what it lets through.
- Use Nuxt UI components and Tailwind classes. There is no Nuxt here: no
  `useFetch`, `useState`, auto-imported `$fetch`, or `#app`.
- `index.html` carries the markers the server's SEO module rewrites:
  `<!--notes:head-->…<!--/notes:head-->` and `<!--notes:app-->`. Keep them.

## Development

```sh
docker compose -f compose.dev.yaml up -d                    # pg, server :8000, client :5173
docker compose -f compose.dev.yaml exec server python scripts/seed.py   # 15 sample notes
```

- **Behind code-server**, start it with
  `DEV_BASE=/absproxy/5173/ DEV_ALLOWED_HOSTS=code.meizuno.com DEV_HMR_CLIENT_PORT=443 DEV_HMR_PROTOCOL=wss`
  and open `https://code.meizuno.com/absproxy/5173/`.
- **Signing in in dev needs no Google.** There is no sign-in page: "Log in"
  goes straight to Google, except where the server offers only the dev
  sign-in. There it opens a dialog for `dev@`, `alice@` or `bob@example.com`
  (`NOTES_DEV_LOGIN`, which the image refuses).

## Before calling work done

Both gates must be clean. CI runs the same ones (`.github/workflows/tests.yml`).

```sh
docker compose -f compose.dev.yaml exec server make verify    # ruff · mypy (strict) · pytest -W error
docker compose -f compose.dev.yaml exec client sh -c 'pnpm build && pnpm typecheck && pnpm test'
```

The client is built before it is type-checked: the Nuxt UI plugin writes the
component prop types that `vue-tsc` then reads.

## Rules that hold everywhere

- **Code, identifiers, comments and commit messages are in English.**
  Conventional Commits; see `.claude/skills/git-commit`.
- **Commits** are authored as Meizuno <yuramiron16@gmail.com>.
- **Changes go through a branch and a pull request,** never straight to `main`.
  Pushing to `main` deploys.
- **The API contract is shared.** The client, ai-chat (MCP and
  `/api/prompts/notes`) and old links all depend on it: paths, JSON shapes,
  status codes, and the NDJSON list. Change it only on purpose, on both sides,
  with tests.
- **No secrets in the repo.** Configuration is `NOTES_*` env. The README has the
  full list.
