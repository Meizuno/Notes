# CLAUDE.md

Instructions for AI agents working in this repository. This is a **Nuxt 4 /
Nitro fullstack app** (Vue 3 + Prisma + Postgres). The rules below adapt the
Clean-Architecture discipline of the sibling [Library](https://github.com/Meizuno/Library)
project to the **Nuxt grain** — they are not a port of its hexagonal/DI layout.

> **Status:** This architecture is **realized for the Note resource** — thin
> handlers, zod boundaries (`shared/schemas/`), a service layer
> (`server/services/`), a domain error taxonomy (`server/utils/errors.ts`),
> fail-fast env validation, structured logging, and the `typecheck`/`lint`/
> `test` gates (run in CI). What is **not** yet migrated: the MCP endpoints
> (`server/api/mcp.ts`, `server/utils/mcp/*`) and the non-note handlers
> (`server/api/auth/*`, `graph.get.ts`, `prompts/*`, …) still predate this
> shape. **When you touch one of those, refactor it to this shape; don't
> rewrite untouched code wholesale.**

---

## The one mental-model difference from Python

In the Python backend, **you build the skeleton**: a composition root,
constructor DI, explicit ports & adapters. The framework imposes almost
nothing.

In Nuxt/Nitro, **the framework _is_ the composition root.** Structure comes from
conventions, not from code you write:

- File path = route. HTTP method = filename suffix (`.get.ts`, `.post.ts`).
- `server/utils/**` is **auto-imported** everywhere on the server.
- `server/middleware/**` runs automatically on every request.
- `server/plugins/**` runs once at startup.
- `shared/**` is auto-imported on **both** client and server (`#shared` alias).
- `event.context` is the request-scoped container.
- `app/composables/**` and `app/components/**` are auto-imported on the client.

**Consequence:** anything you'd hand-roll in Python — a DI container, a router
registry, a composition module wiring concretes — is an **anti-pattern here**,
because it duplicates the framework. Take the *separation-of-concerns
principles* from Library; implement them with **utils + composables + zod +
event.context**, never with classes-and-containers.

The meta-rule from Library's README still governs every decision here:
**a pattern earns its place by solving present pain, not by appearing in a
textbook.**

---

## Quick orientation

Stack: **Nuxt 4** (Vue 3, `<script setup>`), **Nitro** server, **Prisma 6** +
**Postgres** (with `pg_trgm`), **@nuxt/ui 4**, **@nuxtjs/mdc** for Markdown,
**zod** for validation, **pnpm**. Auth is delegated to an **external auth
service** (`runtimeConfig.authServiceUrl`) — this repo validates/refreshes
tokens, it does not issue them.

```
app/                      ── CLIENT (Vue/Nuxt)
├── pages/                ── file-based routes (thin; orchestrate composables)
├── components/           ── presentation only (dumb: props in, events out)
├── composables/          ── CLIENT use-cases: stateful logic + data fetching
└── assets/

server/                   ── SERVER (Nitro)
├── api/                  ── thin HTTP handlers (parse → validate → service → return)
├── services/             ── SERVER use-cases: business logic (notes.ts)
├── utils/                ── auto-imported helpers (db client, auth, data access, error taxonomy)
├── middleware/           ── auth gate, request logging
├── plugins/              ── startup hooks (env validation)
└── routes/              ── non-API routes (robots.txt, sitemap.xml)

shared/                   ── CROSS-CUTTING types + zod schemas (#shared)
prisma/                   ── schema, migrations, seed
```

Before considering work done:

```sh
pnpm run typecheck      # nuxt typecheck (vue-tsc) — must be clean
pnpm run lint           # eslint (@nuxt/eslint) — must be clean
pnpm run test           # vitest — must pass
```

---

## Layering (the core discipline to port)

The Library project's single biggest win is **separating transport, validation,
business logic, and persistence**. The notes resource follows this layering;
hold the same line for new code:

```
HTTP handler (server/api/*)   ── parse params/body, call service, return. NOTHING else.
   ↓
zod schema (shared/ or server) ── validate + type the input at the boundary (= Pydantic)
   ↓
service (server/services/*)    ── business logic = the Python "use case"
   ↓
data access (server/utils/*)   ── Prisma queries, visibility filters
   ↓
Prisma client                  ── the data abstraction (do NOT wrap it in a Repository)
```

**Handlers must be thin.** Target shape:

```ts
// server/api/notes/index.post.ts
export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, createNoteSchema.parse)
  return createNote(event, input)
})
```

```ts
// server/services/notes.ts  (or extend server/utils/notes.ts — both auto-import-friendly)
export async function createNote(event: H3Event, input: CreateNoteInput) {
  const user = requireAuthUser(event)
  return getPrisma().note.create({ data: { user_id: user.id, ...input } })
}
```

A handler that contains an `if (!title?.trim())`, a `new Set([...])` of valid
enum values, or a raw Prisma call **is a refactor target.**

---

## Mandatory patterns

### 1. Validate at the boundary with zod (this is your Pydantic)

- Every request body / query is parsed through a **zod schema**, via
  `readValidatedBody(event, schema.parse)` or `getValidatedQuery(...)`.
- **No inline `if (!x)` validation. No hand-rolled `Set` of enum values.** Use
  `z.enum([...])`, `z.string().trim().min(1)`, `.default(...)`, etc.
- Define the schema once, **infer** the TS type from it
  (`type X = z.infer<typeof xSchema>`), and reuse that type on the client. Do
  not declare the same shape twice.
- Schemas shared by client and server live in **`shared/`** (`#shared` alias).
  Server-only schemas live with their service.

### 2. Service layer = the "use case" layer

- Business logic lives in `server/services/*` (or `server/utils/*` — both are
  auto-imported; prefer `services/` for intent, configure
  `nitro.imports.dirs` if you want it auto-imported under that name).
- A service is a **plain async function** taking the validated input (and
  `event` when it needs auth/context). It is the Nuxt analog of
  `AddNoteUseCase.execute()`. **No classes, no DI container** — that's the
  Python idiom, not this one.
- Services are **pure of HTTP**: they throw typed domain errors (see #4), never
  `createError({ statusCode })` directly.

### 3. Data access stays thin — do NOT build a Repository

- Prisma **is** the data-access abstraction. A Protocol-style Repository with
  multiple implementations (as in Library) is **over-engineering here** —
  there's no second backend to swap, and Prisma is already typed and mockable.
- Keep shared queries and `where`-clause builders in `server/utils/` (the
  existing `noteVisibilityWhere` / `loadNote` in `server/utils/notes.ts` is the
  right pattern — extend it, don't replace it with ports).
- A service may call Prisma directly for trivial CRUD; extract a util only when
  the same query/filter is needed in **two** places.

### 4. One error taxonomy (typed errors carry their own status)

- Define domain error types once in `server/utils/errors.ts` (e.g.
  `NoteNotFound`, `Unauthorized`) and have **services throw them** instead of
  scattering `createError({ statusCode })` through the business logic. Each
  error type defines its HTTP status in exactly **one place** — its class.

  ```ts
  // server/utils/errors.ts
  import { H3Error } from 'h3'

  export class DomainError extends H3Error {
    constructor(statusCode: number, statusMessage: string, message?: string) {
      super(message ?? statusMessage)
      this.name = new.target.name
      this.statusCode = statusCode
      this.statusMessage = statusMessage
    }
  }
  export class NoteNotFound extends DomainError {
    constructor(id?: string) { super(404, 'Note not found', id && `Note ${id} not found`) }
  }
  ```
- **Why extend `H3Error`, not a Nitro plugin hook.** The Nitro `error` hook
  (`nitro.hooks.hook('error', …)`) is **observability-only** — it fires for
  logging/reporting and *cannot change the response*. Nitro renders the status
  straight off `error.statusCode`, and only treats an error as "handled" (vs an
  unhandled 500 with a masked message) when `isError()` is true, which keys off
  H3Error's static brand that subclasses inherit. So a typed `H3Error` subclass
  is the framework-native way to get a centrally-defined error that renders with
  the right status. (A `server/plugins/error-mapper.ts` hook was tried and does
  not work for this — don't reach for it.)
- **Validation errors are already 400.** `readValidatedBody` /
  `getValidatedQuery` wrap a thrown `ZodError` in a 400 at the boundary — no
  mapping needed.
- **Handlers never `try/except` business errors.** Let them bubble (mirrors
  Library's "routes never try/except" rule). The only allowed catch is in
  adapters talking to the external auth service / SMTP, where a failure has a
  defined fallback.

### 5. Fail-fast env validation (= Pydantic Settings)

- Required env (`NUXT_DATABASE_URL`, `NUXT_AUTH_SERVICE_URL`, …) is validated
  **once at startup** with a zod schema in a Nitro plugin, and the process
  **exits on failure** — not on the first request:

  ```ts
  // server/plugins/validate-env.ts
  export default defineNitroPlugin(() => {
    const r = envSchema.safeParse(process.env)
    if (!r.success) { console.error(r.error.format()); process.exit(1) }
  })
  ```
- This replaces the current "throw 500 from `getPrisma()` on first use" pattern.
- All config goes through `runtimeConfig` + `useRuntimeConfig()` — never read
  `process.env` directly in handlers/services (only the env plugin and
  `nuxt.config.ts` may).

### 6. Structured logging with request context

- Generate a `requestId` in `server/middleware/log.ts`, put it on
  `event.context`, and log structured key/value lines (consola/pino), not bare
  string concatenation.
- Downstream logs read context off `event.context`; don't thread `requestId`
  through every function signature.

### 7. The Prisma client is a singleton

- Always go through `getPrisma()` in `server/utils/db.ts`. **Never** `new
  PrismaClient()` anywhere else — it leaks connections under HMR and serverless.

---

## Frontend rules (no Python analog — this is the Nuxt-specific half)

### Composables = client-side use-cases

- Stateful logic and data fetching live in `app/composables/use*.ts`, **one
  responsibility per composable** (the existing `useAuth`, `useImagePaste`,
  `useConfirm` are the right shape).
- When a **page or component** accumulates `ref`s + `$fetch` + save/delete
  logic, **extract it into a composable** — the same move as pulling a use-case
  out of a handler. Example target: the edit-mode state in
  `app/pages/notes/[id].vue` → `useNoteEditor(id)`.

### Components are dumb

- Components render and emit. **No business logic, no scattered `$fetch`** in
  components. Inputs via `defineProps` / `defineModel`, outputs via
  `defineEmits`. `app/components/note/form.vue` is a good model — keep that bar.

### Data fetching discipline

- Use `useFetch` / `useAsyncData` for SSR-aware reads (always pass a stable
  `key`); use `$fetch` only for event-driven mutations (save, delete, logout).
- Don't fetch the same resource from both a page and a child component without
  sharing the `key`.

### Shared types, end-to-end

- The big TS win over the Python project: **one type from DB to component.**
  Derive request/response types from zod schemas in `shared/`, import them in
  both `server/` and `app/`. **Never** redeclare `type Note = {...}` /
  `type Visibility = ...` in a `.vue` file — import them from
  `#shared/schemas/note` instead. (The old local copies in
  `pages/notes/[id].vue` and `components/note/form.vue` have been removed; don't
  reintroduce them.)

---

## Tests

**Vitest + @nuxt/test-utils** are wired up (`pnpm run test`), with coverage for
the notes service, the zod schemas, the visibility util, the env schema, and
the error taxonomy. Keep growing it the same way — once logic lives in services
and composables, it's testable without HTTP or a real DB.

- Runner: **Vitest** + **@nuxt/test-utils** (`vitest.config.ts` defaults to a
  node environment; opt into the Nuxt env per-file with `// @vitest-environment
  nuxt` for composable/component tests).
- **Service tests** (the priority): call the service function with a mocked
  Prisma client + a fake `event.context.user`. No HTTP. This mirrors Library's
  application/use-case tests against in-memory fakes.
- **Composable tests:** mount-free where possible; assert state transitions.
- **Schema tests:** zod schemas get a few "rejects bad input / fills defaults"
  cases — the analog of Library's config fail-fast tests.
- A test tree that mirrors source (`test/server/services/*`, `test/app/composables/*`)
  is preferred, matching the Library convention.

---

## File organization rules

- **One file per route**, method in the suffix. Keep handlers ≤ ~15 lines.
- **One service module per resource** (`server/services/notes.ts`), exporting
  one function per operation (`createNote`, `updateNote`, `deleteNote`, …).
- **zod schemas**: shared ones in `shared/schemas/*`; server-only ones beside
  the service. Infer types from them; don't write parallel `type` aliases.
- **Shared `where`/projection helpers** in `server/utils/` (auto-imported).
- **Startup concerns** (env validation) in `server/plugins/`. The **domain
  error taxonomy** lives in `server/utils/errors.ts` (typed `H3Error`
  subclasses), not a plugin — see #4.
- **One composable per concern** in `app/composables/`; extract page logic into
  composables, not vice versa.

---

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm run dev` |
| Build | `pnpm run build` |
| Preview prod build | `pnpm run preview` |
| Prisma generate | `pnpm run prisma:generate` |
| Prisma migrate (dev) | `pnpm run prisma:migrate` |
| Seed DB | `pnpm run prisma:seed` |
| Typecheck | `pnpm run typecheck` (`nuxt typecheck`) |
| Lint | `pnpm run lint` (`eslint .`) |
| Test | `pnpm run test` (`vitest run`); watch: `pnpm run test:watch` |

---

## TypeScript standards

- **`<script setup lang="ts">`** for all components; explicit `defineProps` /
  `defineEmits` / `defineModel` generic types.
- **No `any`.** Use precise unions, `unknown` + narrowing, or inferred zod
  types. No `@ts-ignore` / `@ts-expect-error` to silence — fix the type; if an
  external-typing gap genuinely requires one, leave an inline comment.
- **Infer, don't redeclare.** Prefer `z.infer` / Prisma-generated types over
  hand-written duplicates of the same shape.
- **`async`/`await`** over raw promise chains in server code.
- **Code, identifiers, comments, commit messages — always English.**

---

## Verification checklist (before completing a task)

1. ✅ Touched handlers are **thin** — parse → validate → service → return, no
   inline validation, no raw Prisma in the handler.
2. ✅ Input is validated with a **zod schema**; the TS type is **inferred** from
   it, not redeclared.
3. ✅ Business logic lives in a **service function**, not the handler.
4. ✅ Services throw **typed domain errors**; no `try/except` in handlers; no
   `createError({ statusCode })` inside services.
5. ✅ No `new PrismaClient()` outside `server/utils/db.ts`.
6. ✅ No `process.env` reads outside the env plugin / `nuxt.config.ts`.
7. ✅ No duplicated `type Note` / `type Visibility` in `.vue` files — shared
   types imported from `shared/`.
8. ✅ New/changed client logic lives in a **composable**, not inline in a page
   or component.
9. ✅ `typecheck` / `lint` / `test` clean (once those scripts exist).
10. ✅ No Repository/port abstraction added over Prisma; no DI container; no
    composition-root module.

---

## What this project deliberately does NOT do

If tempted to add any of the following, **stop and confirm with the human
first** — these are conscious omissions, mirroring Library's "deliberately does
NOT do" discipline but for the Nuxt grain:

- ❌ **Repository pattern / ports & adapters over Prisma.** Prisma is already
  the data abstraction; there is no second backend to swap. A Protocol + impls +
  contract tests (Library's approach) buys nothing here and fights the grain.
- ❌ **A DI container or composition root.** Nitro auto-imports and
  `event.context` are the DI mechanism. Don't hand-build wiring.
- ❌ **Hexagonal `domain/ application/ infrastructure/ presentation/` folders.**
  The layering here is `api → service → data` by file role, not by deep folder
  tree.
- ❌ **Bounded-context slicing** (`note/`, `auth/`, … as Library-style modules).
  The app is one resource (Note) plus delegated auth. Slicing now produces empty
  folders — premature, same reasoning as Library's rejection of per-use-case
  slices.
- ❌ **Building auth/JWT issuance.** Auth is delegated to the external service;
  this repo only validates/refreshes. Don't add token minting, password
  hashing, or a user table.
- ❌ **CQRS / event sourcing / an event bus.** Single reader/writer model, no
  log, no second subscriber to justify a bus.
- ❌ **Class-based services / use-case classes.** Plain functions are the idiom;
  classes-with-`execute` are the Python shape, not this one.
- ❌ **Global mutable module state** beyond the documented Prisma singleton and
  the bounded SSR-refresh cache in `server/utils/auth.ts`.

**The lesson, same as Library:** a pattern earns its place by solving present
pain, not by appearing in a textbook.

---

## When in doubt

1. Match the Nuxt convention before inventing structure — the framework usually
   already has a place for it (`utils`, `composables`, `plugins`, `shared`,
   `middleware`).
2. Read an existing good example in the same area (`useAuth`,
   `components/note/form.vue`, `server/utils/notes.ts`) and mirror its shape.
3. Ask before introducing any abstraction from the "deliberately does NOT do"
   list — including anything ported wholesale from the Python project.
