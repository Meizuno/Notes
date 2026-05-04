import { getPrisma } from '../../utils/db'

// Flat note list keyed by `folder` path, used by the sidebar to build
// its folder tree. Returns every non-deleted note — no pagination,
// because the sidebar shows the whole vault. Cheap: only id/title/folder
// columns, no content, no joins.

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const db = getPrisma()

  return db.note.findMany({
    where: { is_deleted: false },
    select: { id: true, title: true, folder: true },
    orderBy: [{ folder: 'asc' }, { title: 'asc' }]
  })
})
