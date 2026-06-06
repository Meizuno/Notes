import type { CreateNoteInput, UpdateNoteInput, Note } from '#shared/schemas/note'

// Typed client wrapper for the imperative note write-path (plus the
// imperative GETs used by edit / stream). Public signatures use the shared
// schema types, so the request body and response are checked end-to-end.
//
// Payload note: create/update/get all return the NoteRow projection — the
// wire `Note` plus created_at. We type them as `Note` since callers don't
// use created_at; a sound narrowing (NoteRow is a superset of Note).
//
// This is for imperative $fetch ONLY. SSR reads stay on useFetch (keyed,
// dedup-aware) — don't route those through here.
export function useNotesApi() {
  // Nitro infers GET-only for the interpolated /api/notes/:id route, so a
  // typed PUT/DELETE there raises TS2322. A string-typed path falls to the
  // generic $fetch overload (method unconstrained) while the explicit
  // response generic keeps the return typed — no response-erasing casts.
  const notePath = (id: string): string => `/api/notes/${id}`

  const createNote = (input: CreateNoteInput): Promise<Note> =>
    $fetch<Note>('/api/notes', { method: 'POST', body: input })

  const updateNote = (id: string, input: UpdateNoteInput): Promise<Note> =>
    $fetch<Note>(notePath(id), { method: 'PUT', body: input })

  const deleteNote = (id: string): Promise<{ deleted: string }> =>
    $fetch<{ deleted: string }>(notePath(id), { method: 'DELETE' })

  const getNote = (id: string): Promise<Note> =>
    $fetch<Note>(notePath(id))

  return { createNote, updateNote, deleteNote, getNote }
}
