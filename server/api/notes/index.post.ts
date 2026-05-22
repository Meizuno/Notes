const VISIBILITY_VALUES = new Set(['PRIVATE', 'PROTECTED', 'PUBLIC'] as const)
type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { title, content, folder, visibility } = await readBody<{
    title: string
    content?: string
    folder?: string | null
    visibility?: Visibility
  }>(event)
  if (!title?.trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  if (visibility && !VISIBILITY_VALUES.has(visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  }

  const db = getPrisma()
  return db.note.create({
    data: {
      user_id: user.id,
      title: title.trim(),
      content: content ?? '',
      folder: folder?.trim() || null,
      visibility: visibility ?? 'PROTECTED'
    }
  })
})
