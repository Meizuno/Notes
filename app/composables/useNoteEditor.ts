import type { Note, Visibility } from '#shared/schemas/note'

// Client-side use-case for editing a single note: holds the edit-form
// state and the load / save / delete flows for /notes/[id]. The page
// stays thin (routing + SEO) and binds these to <NoteForm>.
//
// The note is NOT fetched for viewing — that's <NoteStream>'s job. We
// only fetch on startEdit, to populate the form.
export function useNoteEditor(id: string) {
  const editing = ref(false)
  const editTitle = ref('')
  const editFolder = ref('')
  const editDescription = ref('')
  const editContent = ref('')
  const editVisibility = ref<Visibility>('PROTECTED')
  const saving = ref(false)
  const loadingEdit = ref(false)

  // Bumped on every successful save; used as the :key on <NoteStream>
  // so it remounts and re-fetches the freshly-saved content.
  const version = ref(0)

  const { confirm } = useConfirm()

  async function startEdit() {
    if (loadingEdit.value) return
    loadingEdit.value = true
    try {
      const note = await $fetch<Note>(`/api/notes/${id}`)
      editTitle.value = note.title
      editFolder.value = note.folder ?? ''
      editDescription.value = note.description ?? ''
      editContent.value = note.content
      editVisibility.value = note.visibility
      editing.value = true
    }
    finally { loadingEdit.value = false }
  }

  async function saveEdit() {
    if (!editTitle.value.trim() || saving.value) return
    saving.value = true
    try {
      await $fetch(`/api/notes/${id}` as string, {
        method: 'PUT',
        body: {
          title: editTitle.value,
          folder: editFolder.value.trim() || null,
          description: editDescription.value.trim() || null,
          content: editContent.value,
          visibility: editVisibility.value
        }
      })
      version.value++
      editing.value = false
    }
    finally { saving.value = false }
  }

  async function deleteNote() {
    const ok = await confirm({
      title: 'Delete note?',
      description: 'This note will be removed. This cannot be undone.',
      confirmLabel: 'Delete'
    })
    if (!ok) return
    await $fetch(`/api/notes/${id}` as string, { method: 'DELETE' })
    await navigateTo('/')
  }

  return {
    editing,
    editTitle,
    editFolder,
    editDescription,
    editContent,
    editVisibility,
    saving,
    loadingEdit,
    version,
    startEdit,
    saveEdit,
    deleteNote
  }
}
