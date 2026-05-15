export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { title, content, folder, public: isPublic } = await readBody<{
    title: string
    content?: string
    folder?: string | null
    public?: boolean
  }>(event)
  if (!title?.trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required' })

  const db = getPrisma()
  return db.note.create({
    data: {
      user_id: user.id,
      title: title.trim(),
      content: content ?? '',
      folder: folder?.trim() || null,
      public: isPublic ?? false
    }
  })
})
