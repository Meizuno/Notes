export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const note = await loadNote(id)
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  return note
})
