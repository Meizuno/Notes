import type { H3Event } from 'h3'
import { getPrisma } from './db'

// Shared note projection used by `/api/notes/[id]` (edit form load).
// The streaming view endpoint at `/api/notes/[id]/stream` embeds its
// own select and emits metadata + content over the wire.

export type NoteRow = {
  id: string
  title: string
  folder: string | null
  content: string
  public: boolean
  updated_at: Date
}

// Visibility filter for read endpoints. Anonymous requests are
// restricted to public notes; authenticated requests see everything
// non-deleted (shared workspace — any authed user can read any note).
// Returns a Prisma where-clause fragment.
export function noteVisibilityWhere(event: H3Event): { is_deleted: false, public?: true } {
  const authed = Boolean(event.context.user)
  return authed
    ? { is_deleted: false }
    : { is_deleted: false, public: true }
}

export function loadNote(event: H3Event, id: string): Promise<NoteRow | null> {
  return getPrisma().note.findFirst({
    where: { id, ...noteVisibilityWhere(event) },
    select: {
      id: true,
      title: true,
      folder: true,
      content: true,
      public: true,
      updated_at: true
    }
  })
}
