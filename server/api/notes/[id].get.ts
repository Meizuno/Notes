export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  // No auth gate here — anon users get filtered to public-only by
  // loadNote(). A private note simply returns 404 to anon, matching
  // the response for non-existent ids (avoids leaking existence).
  const note = await loadNote(event, id)
  if (!note) throw new NoteNotFound(id)
  return note
})
