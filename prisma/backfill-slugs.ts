// One-off backfill: replace the UUID slugs that the add-slug migration set
// on existing rows with friendly title slugs. Run ONCE after deploying that
// migration:
//
//   pnpm run slugs:backfill
//
// Deterministic + idempotent: notes are processed oldest-first, each gets
// its title slug (collisions resolved with -2, -3, … within the batch), and
// a row is only written when its slug actually changes — so a second run is
// a no-op. New notes created through the app already get their slug, so this
// is only for rows that predate the feature.
import { PrismaClient } from '@prisma/client'
import { slugifyTitle, isReservedSlug } from '../server/utils/slug'

const db = new PrismaClient()

async function main() {
  const notes = await db.note.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { created_at: 'asc' }
  })

  const taken = new Set<string>()
  let updated = 0
  for (const n of notes) {
    const base = slugifyTitle(n.title)
    let candidate = base
    let i = 2
    while (isReservedSlug(candidate) || taken.has(candidate)) candidate = `${base}-${i++}`
    taken.add(candidate)
    if (candidate !== n.slug) {
      await db.note.update({ where: { id: n.id }, data: { slug: candidate } })
      updated++
    }
  }

  console.log(`[slugs] backfilled ${updated}/${notes.length} note slug(s)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
