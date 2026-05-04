export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = getPrisma()

  // Shared workspace — any authenticated user can soft-delete any
  // note. Just verify it exists and isn't already deleted.
  const existing = await db.note.findFirst({ where: { id, is_deleted: false } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  await db.note.update({ where: { id }, data: { is_deleted: true } })
  return { deleted: id }
})
