# Notes

A self-hosted notes vault — a shared workspace where any authenticated user can
read, create, edit, and delete notes, except `PRIVATE` notes which are visible
and editable only to their creator. Notes are grouped into implicit folders
(slash-separated paths) and browsable as a force-directed graph or a folder
tree. Each note has a visibility tier (`PRIVATE` / `PROTECTED` / `PUBLIC`) that
gates read access (and, for `PRIVATE`, write access too); public notes are
SSR-rendered for search engines. The visibility filter and the scoped note
CRUD live in one place (`server/utils/notes.ts`), shared by the HTTP API, the
MCP tools, and the prompt endpoints.

## Inspiration

The note-taking experience is inspired by **[Obsidian](https://obsidian.md)** —
a Markdown vault grouped into folders, with a force-directed graph linking notes
to their folders. The difference is the deployment model: where Obsidian is a
local-first, single-user desktop app, this is a **web, self-hosted, multi-user**
take — a shared vault with per-note visibility tiers and link sharing, rendered
server-side so public notes are crawlable.

## Stack

- **[Nuxt 4](https://nuxt.com)** (Vue 3, `<script setup>`) + **Nitro** server
- **Prisma 6** + **PostgreSQL** (with the `pg_trgm` extension for search)
- **[@nuxt/ui](https://ui.nuxt.com)** + **[@nuxtjs/mdc](https://github.com/nuxt-modules/mdc)** for Markdown rendering
- **zod** for request validation, **Vitest** for tests, **pnpm** as the package manager
- Auth is **delegated to an external auth service** — this app validates and
  refreshes tokens, it does not issue them.

The architecture (thin handlers → zod boundary → service layer → Prisma, with a
typed domain-error taxonomy and fail-fast env validation) is documented for
contributors and AI agents in **[CLAUDE.md](CLAUDE.md)**.

## Prerequisites

- **Node 22+** and **pnpm** (see `packageManager` in `package.json`)
- A **PostgreSQL** database with the `pg_trgm` extension available
- A reachable **auth service** exposing `/validate` and `/refresh`

## Environment

Configure via `NUXT_`-prefixed env vars (mapped to `runtimeConfig`). Required env
is validated at startup — the server **exits** if it's missing or invalid
(`server/plugins/validate-env.ts`).

| Variable | Required | Purpose |
|---|---|---|
| `NUXT_DATABASE_URL` | ✅ | Postgres connection string |
| `NUXT_AUTH_SERVICE_URL` | ✅ | Base URL of the external auth service |
| `NUXT_COOKIE_DOMAIN` | – | Parent domain for the shared auth cookies (e.g. `.meizuno.com`) so one sign-in spans every `*.meizuno.com` app; empty → host-only cookies (dev) |
| `NUXT_PUBLIC_SITE_URL` | – | Canonical site URL for sitemap / `<link rel="canonical">` |

## Setup

```sh
pnpm install                 # also runs: nuxt prepare && prisma generate
pnpm run prisma:migrate      # apply migrations (dev)
pnpm run prisma:seed         # optional: seed sample data
pnpm run dev                 # http://localhost:3000
```

## Scripts

| Task | Command |
|---|---|
| Dev server | `pnpm run dev` |
| Build | `pnpm run build` |
| Preview prod build | `pnpm run preview` |
| Typecheck | `pnpm run typecheck` (`nuxt typecheck`) |
| Lint | `pnpm run lint` (`eslint .`) |
| Test | `pnpm run test` · watch: `pnpm run test:watch` |
| Prisma generate | `pnpm run prisma:generate` |
| Prisma migrate (dev) | `pnpm run prisma:migrate` |
| Seed DB | `pnpm run prisma:seed` |

`typecheck`, `lint`, and `test` are the verification gate — keep all three green
before committing. CI runs the same three on every push and pull request.

## Project structure

```
app/         CLIENT — pages (thin), components (dumb), composables (use-cases)
server/
  api/       thin HTTP handlers (parse → validate → service → return)
  services/  business logic (server/services/notes.ts)
  utils/     auto-imported helpers — db client, auth, data access, error taxonomy
  middleware/ auth gate, request logging (requestId + structured logs)
  plugins/   startup hooks (env validation)
  routes/    non-API routes (robots.txt, sitemap.xml)
shared/      cross-cutting zod schemas + types (#shared), client + server
prisma/      schema, migrations, seed
test/        mirrors source (test/server/**, test/shared/**)
```

## Testing

Vitest with `@nuxt/test-utils`. Tests default to a node environment; opt into the
Nuxt runtime per-file with `// @vitest-environment nuxt`. Service tests run
against a mocked Prisma client and a fake `event.context` — no HTTP, no database.

```sh
pnpm run test
```

## Deployment

CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):

1. **verify** — typecheck + lint + test (every push and PR).
2. **build-and-push** — builds the Docker image and pushes it to GHCR (main / tags only).
3. **deploy** — pulls the image and restarts the service on the VPS via Compose.

The container runs `prisma migrate deploy` on start, then serves the Nitro
build. A `/api/health` endpoint backs the Docker healthcheck.
