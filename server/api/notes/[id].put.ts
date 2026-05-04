export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const { title, content, folder } = await readBody<{
    title?: string
    content?: string
    folder?: string | null
  }>(event)

  const db = getPrisma()

  // Notes are a shared workspace — any authenticated user can edit
  // any note. Just verify it exists and isn't soft-deleted.
  const existing = await db.note.findFirst({ where: { id, is_deleted: false } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  return db.note.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(folder !== undefined ? { folder: folder?.trim() || null } : {})
    }
  })
})
