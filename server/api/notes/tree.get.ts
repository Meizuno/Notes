import { getPrisma } from '../../utils/db'
import { noteVisibilityWhere } from '../../utils/notes'

// Flat note list keyed by `folder` path, used by the sidebar to build
// its folder tree. Returns every non-deleted note — no pagination,
// because the sidebar shows the whole vault. Cheap: only id/title/folder
// columns, no content, no joins. Anonymous callers see public notes only.

export default defineEventHandler(async (event) => {
  const db = getPrisma()

  return db.note.findMany({
    where: noteVisibilityWhere(event),
    select: { id: true, title: true, folder: true },
    orderBy: [{ folder: 'asc' }, { title: 'asc' }]
  })
})
