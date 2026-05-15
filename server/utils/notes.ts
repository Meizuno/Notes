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

export function loadNote(id: string): Promise<NoteRow | null> {
  return getPrisma().note.findFirst({
    where: { id, is_deleted: false },
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
