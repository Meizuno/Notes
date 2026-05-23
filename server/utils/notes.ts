import type { H3Event } from 'h3'
import type { Prisma } from '@prisma/client'
import { NoteVisibility } from '@prisma/client'
import { getPrisma } from './db'

// Shared note projection used by `/api/notes/[id]` (edit form load).
// The streaming view endpoint at `/api/notes/[id]/stream` embeds its
// own select and emits metadata + content over the wire.

export type NoteRow = {
  id: string
  title: string
  folder: string | null
  description: string | null
  content: string
  visibility: NoteVisibility
  updated_at: Date
}

export { NoteVisibility }

// Visibility filter for read endpoints. Standard web-auth model:
//   anon   → PUBLIC only.
//   authed → PUBLIC + PROTECTED + own PRIVATE notes. Other users'
//            PRIVATE notes are excluded.
// Returns a Prisma where-clause fragment.
export function noteVisibilityWhere(event: H3Event): Prisma.NoteWhereInput {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    return { is_deleted: false, visibility: NoteVisibility.PUBLIC }
  }
  return {
    is_deleted: false,
    OR: [
      { visibility: { not: NoteVisibility.PRIVATE } },
      { visibility: NoteVisibility.PRIVATE, user_id: user.id }
    ]
  }
}

export function loadNote(event: H3Event, id: string): Promise<NoteRow | null> {
  return getPrisma().note.findFirst({
    where: { id, ...noteVisibilityWhere(event) },
    select: {
      id: true,
      title: true,
      folder: true,
      description: true,
      content: true,
      visibility: true,
      updated_at: true
    }
  })
}
