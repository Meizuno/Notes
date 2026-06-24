// One-off: rewrite in-content links to other notes from the legacy id form
//
//   https://notes.meizuno.com/notes/{id}
//
// to the current slug form
//
//   https://notes.meizuno.com/{slug}
//
// Run ONCE after deploying:
//
//   docker compose exec notes tsx prisma/relink-notes.ts
//
// Safe + idempotent: only absolute links to THIS host are touched (external
// URLs that happen to contain `/notes/...` are left alone), an id that doesn't
// belong to a note is left as-is, and a row is only written when its content
// actually changes — so a second run is a no-op. Override the host with
// NOTES_BASE_URL if it differs.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const BASE = (process.env.NOTES_BASE_URL ?? 'https://notes.meizuno.com').replace(/\/+$/, '')

async function main() {
  const notes = await db.note.findMany({ select: { id: true, slug: true, content: true } })
  const slugById = new Map(notes.map(n => [n.id, n.slug]))

  // Two forms are rewritten:
  //   1. absolute on our host:  <BASE>/notes/<id>  → <BASE>/<slug>
  //   2. root-relative:         /notes/<id>        → /<slug>
  // The relative regex uses a negative lookbehind so it never matches the path
  // INSIDE some other absolute URL (e.g. https://other.com/notes/<id>) — the
  // preceding host char/`:`/`.`/`/` blocks it, leaving only genuine link-start
  // positions like `](/notes/<id>)` or `href="/notes/<id>"`. Unknown ids fall
  // through unchanged.
  const escaped = BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const absRe = new RegExp(`${escaped}/notes/([A-Za-z0-9_-]+)`, 'g')
  const relRe = /(?<![\w./:])\/notes\/([A-Za-z0-9_-]+)/g
  const slugFor = (id: string) => slugById.get(id)

  let updated = 0
  for (const n of notes) {
    if (!n.content) continue
    let next = n.content.replace(absRe, (m, id: string) => {
      const slug = slugFor(id)
      return slug ? `${BASE}/${slug}` : m
    })
    next = next.replace(relRe, (m, id: string) => {
      const slug = slugFor(id)
      return slug ? `/${slug}` : m
    })
    if (next !== n.content) {
      await db.note.update({ where: { id: n.id }, data: { content: next } })
      updated++
    }
  }

  console.log(`[relink] updated ${updated}/${notes.length} note(s)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
