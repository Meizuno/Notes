---
name: verify
description: Run the project's verification gate — the server's (ruff, mypy, pytest) and the client's (build, typecheck, tests) — and report any failures.
---

# Verify

Run the verification suite **before declaring work done** and before any
`/git-commit` or `/git-push`. CI runs the same two gates
(`.github/workflows/tests.yml`); a red check is a blocker, not advice.

Both run in the dev stack (`docker compose -f compose.dev.yaml up -d` first).

## 1. Server — must be clean

```sh
docker compose -f compose.dev.yaml exec server make verify
```

`ruff check` → `mypy` (strict) → `pytest -q -W error`. The database tests use
`notes_test`, which the dev Postgres creates on first start; without
`TEST_DATABASE_URL` they skip, and a green run then proves less.

## 2. Client — must be clean

```sh
docker compose -f compose.dev.yaml exec client sh -c 'pnpm build && pnpm typecheck && pnpm test'
```

Build first: the Nuxt UI Vite plugin writes the component prop types that
`vue-tsc` reads. Then `vue-tsc --noEmit` and `vitest run`.

## Optional, when it matters (a release, a risky merge, asked for)

- `docker build -t notes .` — the production image builds, and its `/health`
  answers when run with `NOTES_DATABASE_URL` and `NOTES_JWT_SECRET`.
- `docker compose -f compose.dev.yaml exec client pnpm audit` — no high/critical
  advisories.

## Report

```
✅ server: ruff clean · mypy clean · 441 passed
✅ client: build ok · typecheck clean · 100 passed
```

On a failure, stop the chain, show what broke and what was skipped, and fix it.
Never silence a check (`# type: ignore`, `noqa`, `.skip`, `@ts-expect-error`)
to get green; a genuine external-typing gap may carry one with a one-line reason.
