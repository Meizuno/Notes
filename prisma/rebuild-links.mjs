// Same logic as rebuild-links.ts but as plain ES-module JS so it
// runs inside the prod Docker image without tsx / pnpm. Copy into
// the container with `docker cp` and run via `node`.
//
//   docker cp prisma/rebuild-links.mjs <container>:/app/rebuild-links.mjs
//   docker compose exec <service> node /app/rebuild-links.mjs

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const WIKI_RE = /\[\[([^\]]+)\]\]/g

async function main() {
  const notes = await db.note.findMany({
    where: { is_deleted: false },
    select: { id: true, title: true, content: true }
  })
  console.log(`[rebuild-links] scanning ${notes.length} notes`)

  const idByTitle = new Map()
  for (const n of notes) idByTitle.set(n.title, n.id)

  const cleared = await db.noteLink.deleteMany({})
  console.log(`[rebuild-links] cleared ${cleared.count} existing rows`)

  let resolved = 0
  let dangling = 0
  const rows = []
  for (const n of notes) {
    const seen = new Set()
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
