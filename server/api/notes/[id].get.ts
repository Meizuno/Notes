export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  // No auth gate here — anon users (viewerId null) are filtered to
  // public-only by loadNoteScoped. A private note simply returns 404 to
  // anon, matching the response for non-existent ids (avoids leaking
  // existence). includeShared opens the by-link escape: an is_shared note
  // is readable by anyone holding the URL, regardless of tier.
  const note = await loadNoteScoped(viewerId(event), id, { includeShared: true })
  if (!note) throw new NoteNotFound(id)
  return note
})
