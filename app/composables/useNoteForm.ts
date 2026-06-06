import type { CreateNoteInput, UpdateNoteInput, Note, Visibility } from '#shared/schemas/note'

// Shared create/edit form state: the five fields, a populate() for the edit
// path, and typed body builders. Both the create page and the edit
// composable use this so the field refs and the request body exist exactly
// once. The empty-string → null collapse here is the single client-side
// copy (the server service also collapses — belt and suspenders, not a
// third copy).
export function useNoteForm() {
  const title = ref('')
  const folder = ref('')
  const description = ref('')
  const content = ref('')
  const visibility = ref<Visibility>('PROTECTED')

  function populate(note: Pick<Note, 'title' | 'folder' | 'description' | 'content' | 'visibility'>) {
    title.value = note.title
    folder.value = note.folder ?? ''
    description.value = note.description ?? ''
    content.value = note.content
    visibility.value = note.visibility
  }

  // One body literal, reused for create and update — their shapes coincide
  // here since the form always supplies every field.
  const body = () => ({
    title: title.value,
    content: content.value,
    folder: folder.value.trim() || null,
    description: description.value.trim() || null,
    visibility: visibility.value
  })

  const toCreateInput = (): CreateNoteInput => body()
  const toUpdateInput = (): UpdateNoteInput => body()

  return { title, folder, description, content, visibility, populate, toCreateInput, toUpdateInput }
}
