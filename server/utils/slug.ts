import slugify from '@sindresorhus/slugify'

// Note title -> URL slug. slugify transliterates (Cyrillic / Latin
// diacritics -> ASCII), lowercases, and dash-joins; we cap the length and
// fall back to 'note' for titles that reduce to nothing (whitespace- or
// symbol-only). Pure + deterministic — the global-uniqueness suffix
// (-2, -3, ...) is added by uniqueNoteSlug in server/utils/notes.ts.
const SLUG_MAX = 80
const SLUG_FALLBACK = 'note'

export function slugifyTitle(title: string): string {
  const slug = slugify(title).slice(0, SLUG_MAX).replace(/-+$/, '')
  return slug || SLUG_FALLBACK
}

// Slugs a note may not take, because notes are served at the root
// (`/<slug>`) and would otherwise shadow these top-level routes. The
// uniqueness loops (uniqueNoteSlug and the seed) treat a reserved slug
// as already taken, so they fall through to `<base>-2`.
export const RESERVED_SLUGS = new Set(['new', 'login', 'api'])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}
