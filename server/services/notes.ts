import type { H3Event } from 'h3'
import type { CreateNoteInput, UpdateNoteInput, ListNotesQuery } from '#shared/schemas/note'
import { getPrisma } from '../utils/db'
import { requireAuthUser, viewerId } from '../utils/auth'
import { buildNoteUpdateData, listNotesScoped, softDeleteScoped, updateNoteScoped } from '../utils/notes'

// HTTP use-cases for the Note resource. Thin wrappers over the shared,
// transport-agnostic data-access in ../utils/notes (which owns the
// visibility scope + atomic scoped mutations). These add the HTTP auth gate
// and pass the viewer (the logged-in user's id, or null for anon reads).
//
// create/update/delete require a logged-in user; the scoped mutations also
// confine update/delete to notes the viewer may see — so a user can edit or
// delete any shared note but not another user's PRIVATE one. (This tightens
// the earlier behaviour where any authed user could edit any note; it
// matches the MCP tools and the shared-workspace model.)

export async function createNote(event: H3Event, input: CreateNoteInput) {
  const user = requireAuthUser(event)
  return getPrisma().note.create({
    data: {
      user_id: user.id,
      title: input.title,
      content: input.content,
      // Schema already trims; collapse empty/absent to null here.
      folder: input.folder || null,
      description: input.description || null,
      visibility: input.visibility
    }
  })
}

export async function updateNote(event: H3Event, id: string, input: UpdateNoteInput) {
  const user = requireAuthUser(event)
  return updateNoteScoped(user.id, id, buildNoteUpdateData(input))
}

export async function deleteNote(event: H3Event, id: string) {
  const user = requireAuthUser(event)
  return softDeleteScoped(user.id, id)
}

// List is readable anonymously (PUBLIC only); the streaming/snippet shaping
// stays in the handler, which pulls rows from here.
export async function listNotes(event: H3Event, query: ListNotesQuery) {
  return listNotesScoped(viewerId(event), query)
}
