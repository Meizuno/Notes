import { getPrisma } from '../../utils/db'
import { noteVisibilityWhere } from '../../utils/notes'

// Flat note list used by the home tree view + form folder picker.
// Returns every non-deleted (and visible-to-this-caller) note in
// `created_at` ascending order so the tree client can render notes
// oldest-first inside each folder. Cheap projection — only the
// columns the consumers need.

export default defineEventHandler(async (event) => {
  const db = getPrisma()

  return db.note.findMany({
    where: noteVisibilityWhere(viewerId(event)),
    select: { id: true, title: true, folder: true, created_at: true },
    orderBy: { created_at: 'asc' }
  })
})
