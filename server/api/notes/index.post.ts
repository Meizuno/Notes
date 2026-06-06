import { createNoteSchema } from '#shared/schemas/note'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, createNoteSchema.parse)
  return createNote(event, input)
})
