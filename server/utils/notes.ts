import { Prisma, NoteVisibility } from '@prisma/client'
import { getPrisma } from './db'
import { NoteNotFound } from './errors'
import { slugifyTitle, isReservedSlug } from './slug'

// Single home for note data-access. The visibility rule and the scoped,
// atomic CRUD live here exactly once so every caller (HTTP services, MCP
// tools, prompt endpoints) shares one filter — a new call site can't forget
// it. Concrete auto-imported functions; deliberately NO repository
// interface / class / DI (see CLAUDE.md "deliberately does NOT do").
//
// The viewer is passed explicitly as a user id (or null for anonymous)
// instead of read off event.context, so the same functions serve HTTP
// (event.context.user?.id, via viewerId()) and MCP / prompts (a
// header-supplied id).

export { NoteVisibility }

// Full single-note projection returned by loadNoteScoped / the scoped
// mutations. (Matches what MCP's get_note returned.)
export type NoteRow = {
  id: string
  slug: string
  title: string
  folder: string | null
  description: string | null
  content: string
  visibility: NoteVisibility
  is_shared: boolean
  created_at: Date
  updated_at: Date
}

// Row shape from listNotesScoped — carries `content` so callers derive
// snippet / hasContent, and `visibility` for MCP.
export type NoteListRow = {
  id: string
  slug: string
  title: string
  folder: string | null
  content: string
  visibility: NoteVisibility
  updated_at: Date
}

export type NoteListParams = {
  search?: string
  folder?: string
  limit: number
  offset: number
}

// The single-note projection (NoteRow). Exported so create/update/get all
// return the same shape — the wire Note plus created_at.
export const NOTE_SELECT = {
  id: true,
  slug: true,
  title: true,
  folder: true,
  description: true,
  content: true,
  visibility: true,
  is_shared: true,
  created_at: true,
  updated_at: true
} as const

// Visibility filter. Standard web-auth model:
//   null (anon) → PUBLIC only.
//   a user id   → PUBLIC + PROTECTED + that user's own PRIVATE notes.
// Other users' PRIVATE notes are always excluded.
export function noteVisibilityWhere(viewerId: string | null): Prisma.NoteWhereInput {
  if (!viewerId) {
    return { is_deleted: false, visibility: NoteVisibility.PUBLIC }
  }
  return {
    is_deleted: false,
    OR: [
      { visibility: { not: NoteVisibility.PRIVATE } },
      { visibility: NoteVisibility.PRIVATE, user_id: viewerId }
    ]
  }
}

// By-id read filter for the "share by link" feature. Same as the tier
// scope above, plus an escape hatch: any `is_shared` note is readable by
// anyone holding the URL, regardless of tier (incl. anonymous). This is
// ONLY for single-note reads (the note page / stream) — listing keeps
// using noteVisibilityWhere so shared notes don't leak into other users'
// tree / graph / search. Mutations also stay on noteVisibilityWhere, so a
// stranger with the link can read but not edit or delete.
export function noteByIdReadableWhere(viewerId: string | null): Prisma.NoteWhereInput {
  const tier: Prisma.NoteWhereInput[] = viewerId
    ? [
        { visibility: { not: NoteVisibility.PRIVATE } },
        { visibility: NoteVisibility.PRIVATE, user_id: viewerId }
      ]
    : [{ visibility: NoteVisibility.PUBLIC }]
  return {
    is_deleted: false,
    OR: [...tier, { is_shared: true }]
  }
}

// Match a note by slug OR id, so friendly `/<slug>` URLs and older
// `/<uuid>` links (and redirected `/notes/<uuid>` ones) both resolve.
// Callers AND this with the visibility
// scope (both use a top-level OR, which can't share one object key).
//
// `id` is a Postgres UUID column, so comparing it against a non-UUID slug
// throws P2023 ("invalid character"). Only include the id branch when the
// key actually looks like a UUID; a normal slug matches by slug alone.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function noteKeyWhere(key: string): Prisma.NoteWhereInput {
  return UUID_RE.test(key)
    ? { OR: [{ slug: key }, { id: key }] }
    : { slug: key }
}

// Generate a table-unique slug for a new note: the base slug from the
// title, then -2, -3, … until free. Checked against ALL rows (the slug
// uniqueness is table-wide, including soft-deleted notes) and against the
// reserved set, so a note can never shadow a top-level route (/new, …).
export async function uniqueNoteSlug(title: string): Promise<string> {
  const db = getPrisma()
  const base = slugifyTitle(title)
  let candidate = base
  let n = 2
  while (isReservedSlug(candidate) || await db.note.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

// Snippet for list/search results. Search-aware: a window around the first
// match, else a leading slice. Unifies two prior copies — note the old MCP
// copy returned null when there was no query/match; it now gets the
// leading-slice fallback like the HTTP endpoints.
export function makeNoteSnippet(content: string, search?: string): string | null {
  if (!content) return null
  if (search) {
    const idx = content.toLowerCase().indexOf(search.toLowerCase())
    if (idx >= 0) {
      const start = Math.max(0, idx - 40)
      const end = Math.min(content.length, idx + search.length + 40)
      return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
    }
  }
  return content.slice(0, 120).trim() + (content.length > 120 ? '…' : '')
}

// Build a partial Note update payload: only the keys present in `input`
// are written ("leave unchanged" on omission); folder/description collapse
// empty/whitespace to null; title is trimmed.
export function buildNoteUpdateData(input: {
  title?: string
  content?: string
  folder?: string | null
  description?: string | null
  visibility?: NoteVisibility
  is_shared?: boolean
}): Prisma.NoteUpdateInput {
  // PUBLIC is shared by definition, so a visibility→PUBLIC change forces
  // is_shared true regardless of (or in the absence of) an is_shared key;
  // otherwise the flag is written only when explicitly present.
  const sharedOverride
    = input.visibility === NoteVisibility.PUBLIC ? true
      : input.is_shared !== undefined ? input.is_shared
        : undefined
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.folder !== undefined ? { folder: input.folder?.trim() || null } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(sharedOverride !== undefined ? { is_shared: sharedOverride } : {})
  }
}

// Scoped list/search with pagination. The visibility filter is always
// applied; search is AND-wrapped so it can't clobber the visibility OR
// (the bug the old HTTP list had — an authed search leaked other users'
// PRIVATE notes; MCP already AND-wrapped).
export async function listNotesScoped(
  viewerId: string | null,
  { search, folder, limit, offset }: NoteListParams
): Promise<{ items: NoteListRow[], total: number }> {
  const where: Prisma.NoteWhereInput = {
    ...noteVisibilityWhere(viewerId),
    ...(search
      ? {
          AND: [{
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { content: { contains: search, mode: 'insensitive' as const } }
            ]
          }]
        }
      : {}),
    ...(folder ? { folder: { startsWith: folder } } : {})
  }

  const db = getPrisma()
  const [items, total] = await Promise.all([
    db.note.findMany({
      where,
      select: { id: true, slug: true, title: true, folder: true, content: true, visibility: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      skip: offset,
      take: limit
    }),
    db.note.count({ where })
  ])
  return { items, total }
}

// Single-note read within the viewer's visibility scope. Returns null when
// the note is missing, deleted, or another user's PRIVATE note. Pass
// `{ includeShared: true }` (the web note page / stream) to also surface
// is_shared notes reachable by link; MCP / prompts omit it to keep their
// tier-only scope.
export function loadNoteScoped(
  viewerId: string | null,
  key: string,
  opts: { includeShared?: boolean } = {}
): Promise<NoteRow | null> {
  const scope = opts.includeShared ? noteByIdReadableWhere(viewerId) : noteVisibilityWhere(viewerId)
  return getPrisma().note.findFirst({
    where: { ...scope, AND: [noteKeyWhere(key)] },
    select: NOTE_SELECT
  })
}

// Scoped update by slug-or-id. The note is first resolved WITHIN the
// viewer's visibility scope (so a user can't reach another's PRIVATE note),
// then updated by its resolved id. `update`'s where takes a single unique
// field, so we can't put the slug-or-id OR there directly — hence the
// resolve-then-update. P2025 (row vanished between the two) → NoteNotFound.
export async function updateNoteScoped(
  viewerId: string | null,
  key: string,
  data: Prisma.NoteUpdateInput
): Promise<NoteRow> {
  const db = getPrisma()
  const target = await db.note.findFirst({
    where: { ...noteVisibilityWhere(viewerId), AND: [noteKeyWhere(key)] },
    select: { id: true }
  })
  if (!target) throw new NoteNotFound(key)
  try {
    return await db.note.update({ where: { id: target.id }, data, select: NOTE_SELECT })
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NoteNotFound(key)
    }
    throw err
  }
}

// Atomic scoped soft delete. updateMany carries the slug-or-id match AND the
// visibility scope in one statement, so a zero count (nothing matched) is
// the not-found signal — no read-then-write race.
export async function softDeleteScoped(viewerId: string | null, key: string): Promise<{ deleted: string }> {
  const { count } = await getPrisma().note.updateMany({
    where: { ...noteVisibilityWhere(viewerId), AND: [noteKeyWhere(key)] },
    data: { is_deleted: true }
  })
  if (count === 0) throw new NoteNotFound(key)
  return { deleted: key }
}
