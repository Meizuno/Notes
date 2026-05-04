export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = Number(getRouterParam(event, 'id'))

  const note = await loadNote(id)
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  return note
})
