import { Prisma, NoteVisibility } from '@prisma/client'
import { getPrisma } from './db'
import { NoteNotFound } from './errors'

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
  title: string
  folder: string | null
  description: string | null
  content: string
  visibility: NoteVisibility
  created_at: Date
  updated_at: Date
}

// Row shape from listNotesScoped — carries `content` so callers derive
// snippet / hasContent, and `visibility` for MCP.
export type NoteListRow = {
  id: string
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

const NOTE_SELECT = {
  id: true,
  title: true,
  folder: true,
  description: true,
  content: true,
  visibility: true,
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
}): Prisma.NoteUpdateInput {
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.folder !== undefined ? { folder: input.folder?.trim() || null } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
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
      select: { id: true, title: true, folder: true, content: true, visibility: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      skip: offset,
      take: limit
    }),
    db.note.count({ where })
  ])
  return { items, total }
}

// Single-note read within the viewer's visibility scope. Returns null when
// the note is missing, deleted, or another user's PRIVATE note.
export function loadNoteScoped(viewerId: string | null, id: string): Promise<NoteRow | null> {
  return getPrisma().note.findFirst({
    where: { id, ...noteVisibilityWhere(viewerId) },
    select: NOTE_SELECT
  })
}

// Atomic scoped update: the existence + visibility filter rides in the
// where clause, so there's no read-then-write race and a user can't touch
// another user's PRIVATE note. Prisma's P2025 ("no row matched") becomes
// NoteNotFound — the one allowed catch, at the Prisma adapter boundary.
export async function updateNoteScoped(
  viewerId: string | null,
  id: string,
  data: Prisma.NoteUpdateInput
): Promise<NoteRow> {
  try {
    return await getPrisma().note.update({
      // Spread first, then `id` last: update's where is NoteWhereUniqueInput
      // (id: string), and the visibility fragment's optional id type would
      // otherwise widen it.
      where: { ...noteVisibilityWhere(viewerId), id },
      data,
      select: NOTE_SELECT
    })
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NoteNotFound(id)
    }
    throw err
  }
}

// Atomic scoped soft delete. updateMany returns a count rather than
// throwing, so a zero count (no row matched the id + visibility scope) is
// the not-found signal.
export async function softDeleteScoped(viewerId: string | null, id: string): Promise<{ deleted: string }> {
  const { count } = await getPrisma().note.updateMany({
    where: { id, ...noteVisibilityWhere(viewerId) },
    data: { is_deleted: true }
  })
  if (count === 0) throw new NoteNotFound(id)
  return { deleted: id }
}
