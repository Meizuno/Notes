import type { H3Event } from 'h3'
import { Prisma } from '@prisma/client'
import type { CreateNoteInput, UpdateNoteInput, ListNotesQuery } from '#shared/schemas/note'
import { getPrisma } from '../utils/db'
import { noteVisibilityWhere } from '../utils/notes'
import { requireAuthUser } from '../utils/auth'
import { NoteNotFound } from '../utils/errors'

// Note use-cases. Plain async functions taking the validated input (and
// `event` for auth/visibility context) — the Nuxt analog of the Python
// use-case layer. HTTP parsing stays in the handlers; persistence stays
// in Prisma. Inputs are pre-validated by the zod schemas in
// shared/schemas/note, so these functions trust their shape.
//
// Errors are the typed domain taxonomy from ../utils/errors (NoteNotFound);
// requireAuthUser raises Unauthorized. Nitro renders each with its own
// status — handlers don't translate them.

export async function createNote(event: H3Event, input: CreateNoteInput) {
  const user = requireAuthUser(event)
  return getPrisma().note.create({
    data: {
      user_id: user.id,
      title: input.title,
      content: input.content,
      // Schema already trims; collapse empty/absent to null here.
      folder: input.folder || null,
      description: input.description || null,
      visibility: input.visibility
    }
  })
}

export async function updateNote(event: H3Event, id: string, input: UpdateNoteInput) {
  requireAuthUser(event)

  // Shared workspace — any authenticated user may edit any note. The
  // existence + not-deleted check rides in the where clause, so this is a
  // single atomic statement (no read-then-write TOCTOU window). Only the
  // keys present in the body are written — omission means "leave unchanged"
  // (schema already trimmed; collapse empty → null for folder/description).
  try {
    return await getPrisma().note.update({
      where: { id, is_deleted: false },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.folder !== undefined ? { folder: input.folder || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
      }
    })
  }
  catch (err) {
    // Prisma adapter boundary: P2025 ("record to update not found") means no
    // row matched id + is_deleted:false. Translate it into the domain
    // taxonomy; re-throw anything else. This is the one allowed catch here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NoteNotFound(id)
    }
    throw err
  }
}

export async function deleteNote(event: H3Event, id: string) {
  requireAuthUser(event)

  // Single-statement soft delete: the existence + not-deleted check rides in
  // the where clause (no TOCTOU window). updateMany returns a count rather
  // than throwing, so a zero count is the not-found signal — no try/catch.
  const { count } = await getPrisma().note.updateMany({
    where: { id, is_deleted: false },
    data: { is_deleted: true }
  })
  if (count === 0) throw new NoteNotFound(id)
  return { deleted: id }
}

// Data fetch for the note list. Returns the rows + total for the caller;
// the streaming/snippet presentation stays in the handler. Visibility is
// scoped to the caller via noteVisibilityWhere (anon → public only).
export async function listNotes(event: H3Event, query: ListNotesQuery) {
  const db = getPrisma()

  const where = {
    ...noteVisibilityWhere(event),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' as const } },
            { content: { contains: query.search, mode: 'insensitive' as const } }
          ]
        }
      : {}),
    ...(query.folder ? { folder: { startsWith: query.folder } } : {})
  }

  const [items, total] = await Promise.all([
    db.note.findMany({
      where,
      select: { id: true, title: true, folder: true, content: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      skip: query.offset,
      take: query.limit
    }),
    db.note.count({ where })
  ])

  return { items, total }
}
