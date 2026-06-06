import { updateNoteSchema } from '#shared/schemas/note'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const input = await readValidatedBody(event, updateNoteSchema.parse)
  return updateNote(event, id, input)
})
