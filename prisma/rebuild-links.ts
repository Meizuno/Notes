// Re-parses every non-deleted note's content and rewrites the
// `NoteLink` table from scratch. One-shot maintenance for two cases:
//   - Bootstrapping after a bulk import (CSV restore, hand-seeded
//     rows) where the runtime POST/PUT indexer never ran.
//   - Recovering from drift if the indexer ever falls behind reality.
//
// Idempotent. Safe to re-run as often as you want.
//
// Usage:
//   pnpm prisma:rebuild-links
//
// Environment:
//   NUXT_DATABASE_URL must point at the target DB (same env var the
//   running app uses, so .env files just work).

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const WIKI_RE = /\[\[([^\]]+)\]\]/g

async function main() {
  const notes = await db.note.findMany({
    where: { is_deleted: false },
    select: { id: true, title: true, content: true }
  })
  console.log(`[rebuild-links] scanning ${notes.length} notes`)

  const idByTitle = new Map<string, string>()
  for (const n of notes) idByTitle.set(n.title, n.id)

  // Wipe the table in one statement so a partially-rebuilt state
  // never coexists with stale rows.
  const cleared = await db.noteLink.deleteMany({})
  console.log(`[rebuild-links] cleared ${cleared.count} existing rows`)

  let resolved = 0
  let dangling = 0
  const rows: { from_id: string, to_title: string, to_id: string | null }[] = []
  for (const n of notes) {
    const seen = new Set<string>()
    for (const m of n.content.matchAll(WIKI_RE)) {
      const target = m[1]?.trim()
      if (!target || seen.has(target)) continue
      seen.add(target)
      const toId = idByTitle.get(target) ?? null
      rows.push({ from_id: n.id, to_title: target, to_id: toId })
      if (toId) resolved++
      else dangling++
    }
  }

  if (rows.length) {
    await db.noteLink.createMany({ data: rows, skipDuplicates: true })
  }
  console.log(`[rebuild-links] done — ${rows.length} links (${resolved} resolved, ${dangling} dangling)`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
