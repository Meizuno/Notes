const VISIBILITY_VALUES = new Set(['PRIVATE', 'PROTECTED', 'PUBLIC'] as const)
type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const { title, content, folder, description, visibility } = await readBody<{
    title?: string
    content?: string
    folder?: string | null
    description?: string | null
    visibility?: Visibility
  }>(event)
  if (visibility !== undefined && !VISIBILITY_VALUES.has(visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  }

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
      ...(folder !== undefined ? { folder: folder?.trim() || null } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(visibility !== undefined ? { visibility } : {})
    }
  })
})
