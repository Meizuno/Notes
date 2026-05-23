// Seeds a small notes vault for development.
// Run with: pnpm prisma:seed
//
// 15 notes grouped by folder (Programming/, Reading/, Productivity/,
// plus two root-level notes). Plain markdown content — references
// between notes are just words, not auto-resolved links, since the
// vault no longer has a wiki-link layer.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const USER_ID = 'seed-user'

type Seed = { title: string, folder?: string, description?: string, content: string }

const notes: Seed[] = [
  {
    title: 'Index',
    description: 'Landing page with links to the main hubs in the vault.',
    content: `# Index

Landing page for the vault. Hubs:

- Programming — language and framework notes
- Books to Read — current reading queue
- Daily Notes — journaling
- Notes App — meta notes about this app`
  },
  {
    title: 'Notes App',
    description: 'Meta notes about this app — goals, architecture, current status.',
    content: `# Notes App

This app. A self-hosted vault built on Nuxt + Vue + Prisma.

## Goals
- Markdown notes, grouped by folder.
- Graph view at \`/\`.
- Shared workspace — any authed user can edit anything.

## Status
- CRUD: working
- Graph: folder topology`
  },
  {
    title: 'Programming',
    folder: 'Programming',
    description: 'Hub linking to every technical note in the vault — languages, frameworks, tooling.',
    content: `# Programming

Hub for technical notes.

## Languages
- TypeScript — primary
- JavaScript — fundamentals

## Frameworks
- Vue — UI framework
- Nuxt — full-stack on top of Vue

## Tooling
- Markdown — note format
- Prisma — ORM`
  },
  {
    title: 'TypeScript',
    folder: 'Programming/Languages',
    description: 'Statically-typed superset of JavaScript. Patterns I reach for and open questions about type design.',
    content: `# TypeScript

Statically-typed superset of JavaScript. Pairs especially well with Vue 3 — the \`<script setup lang="ts">\` flow gives full inference for props, refs, and \`defineModel\`.

## What I reach for
- \`as const\` for literal-narrowing
- discriminated unions for finite state machines
- \`satisfies\` to validate without widening

## Open question
- worth using \`zod\` schemas as the source of truth and inferring TS types from them?`
  },
  {
    title: 'JavaScript',
    folder: 'Programming/Languages',
    description: 'Language quirks and idioms worth keeping in muscle memory.',
    content: `# JavaScript

The runtime under TypeScript. Notes on language quirks worth keeping in muscle memory:

- \`Object.fromEntries\` + \`Object.entries\` for map/transform pipelines.
- \`structuredClone\` deep-copies most things (not functions, not DOM nodes).
- \`Array.prototype.at(-1)\` for last element.

See also Markdown for fenced code rendering quirks.`
  },
  {
    title: 'Vue',
    folder: 'Programming/Frameworks',
    description: 'Reactive UI framework notes — Composition API, defineModel, TypeScript integration.',
    content: `# Vue

Reactive UI framework. Notes here are mostly about Composition API + \`<script setup>\`.

- TypeScript integration is excellent.
- For server-rendered apps, Nuxt is the default choice.
- \`defineModel\` removes most v-model boilerplate.

Related: Notes App is built on Vue + Nuxt.`
  },
  {
    title: 'Nuxt',
    folder: 'Programming/Frameworks',
    description: 'Full-stack Vue framework — SSR, file-based routing, Nitro server, auto-imports.',
    content: `# Nuxt

Full-stack Vue framework. SSR, file-based routing, Nitro server, auto-imports.

## What I use it for
- Notes App (this app)
- Recipe Book (shared-workspace recipe vault)

## Patterns I keep coming back to
- Server components for cacheable rendered fragments.
- NDJSON streaming endpoints for progressive rendering.
- \`useState\` to persist cross-navigation list state.`
  },
  {
    title: 'Markdown',
    folder: 'Programming/Tools',
    description: 'Plain-text formatting used for every note in this vault. CommonMark + GFM conventions.',
    content: `# Markdown

Plain-text formatting language. Used as the canonical content format in this vault.

- Lists prefer \`-\` markers (CommonMark + GFM).
- Headings are ATX (\`#\` style).
- Code fences use triple backticks with a language tag.`
  },
  {
    title: 'Prisma',
    folder: 'Programming/Tools',
    description: 'TypeScript-first ORM for PostgreSQL. Schema-first workflow and migration cadence.',
    content: `# Prisma

TypeScript-first ORM for PostgreSQL (and others). Notes:

- Schema-first: \`schema.prisma\` is the source of truth, generated types follow.
- Use \`select\` over \`include\` to avoid over-fetching.
- Migrations: \`prisma migrate dev\` for dev, \`prisma migrate deploy\` in prod.

Used by Notes App for the Note table.`
  },
  {
    title: 'Books to Read',
    folder: 'Reading',
    description: 'Current reading queue with one-line notes on why each book is interesting.',
    content: `# Books to Read

Currently queued:

- Designing Data-Intensive Applications — distributed systems primer
- The Pragmatic Programmer — re-read
- Atomic Habits — behaviour design

Add more from Daily Notes when I jot something down.`
  },
  {
    title: 'Designing Data-Intensive Applications',
    folder: 'Reading/Books',
    description: 'Kleppmann\'s backend engineering primer — replication, partitioning, transactions, consensus, batch vs stream.',
    content: `# Designing Data-Intensive Applications

By Martin Kleppmann. The book everyone recommends for backend engineers.

## Topics covered
- Replication, partitioning, transactions
- Consensus, ordering, batch vs stream
- Real examples drawn from production systems

Cross-links to Programming when reading the chapters on distributed databases — e.g., why Prisma's default isolation levels matter.`
  },
  {
    title: 'The Pragmatic Programmer',
    folder: 'Reading/Books',
    description: '20th anniversary edition. Themes that still hold up: DRY, tracer bullets, plain text.',
    content: `# The Pragmatic Programmer

Andy Hunt + Dave Thomas. The 20th anniversary edition holds up.

Themes I keep returning to:
- DRY — but not pre-emptively. Three similar lines beats a premature abstraction.
- Tracer bullets — get an end-to-end working slice before optimising any single piece.
- Plain text rules. Hence: Markdown over rich-text editors.

See also: Productivity notes.`
  },
  {
    title: 'Daily Notes',
    folder: 'Productivity',
    description: 'Free-form journaling. One note per day, top section is the day\'s shipping list.',
    content: `# Daily Notes

Free-form journaling. Each entry tagged with a date and linked from here.

## Pattern
- One note per day, title \`YYYY-MM-DD\`.
- Top section: three things to ship today.
- Middle: scratchpad.
- Bottom: links to anything I want to revisit, e.g. Books to Read or Ideas.

This note is the index — individual day-notes link back here.`
  },
  {
    title: 'Productivity',
    folder: 'Productivity',
    description: 'Techniques that actually stick — time-boxing, paper triage, hard task first.',
    content: `# Productivity

Loose collection of techniques that actually stick.

- Time-boxing > to-do lists.
- One physical notebook for triage; digital for archive.
- The first 30 minutes of the day go to the hardest task.

Inspirations from The Pragmatic Programmer and (eventually) Atomic Habits.`
  },
  {
    title: 'Ideas',
    folder: 'Productivity',
    description: 'Raw idea park — promote each item to a proper note once it grows legs.',
    content: `# Ideas

Park ideas here, promote to a proper note when they grow legs.

- A graph view that animates new links as they appear (matches the Notes App streaming aesthetic).
- A "weekly review" that surfaces orphan notes — anything in the vault with no inbound or outbound links.
- A keyboard-only quick-switcher (Ctrl+P) over note titles, with fuzzy-match.`
  }
]

async function main() {
  console.log('[seed] clearing previous seed data')
  await db.note.deleteMany({ where: { user_id: USER_ID } })

  console.log(`[seed] creating ${notes.length} notes`)
  for (const n of notes) {
    await db.note.create({
      data: {
        user_id: USER_ID,
        title: n.title,
        folder: n.folder ?? null,
        description: n.description ?? null,
        content: n.content
      }
    })
  }

  console.log(`[seed] done — ${notes.length} notes`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
