// Client-side use-case for editing a single note. Holds the edit-specific
// concerns (view-mode toggle, remount key, delete-with-confirm) and drives
// the shared form state (useNoteForm) + the typed API wrapper (useNotesApi).
//
// The note is NOT fetched for viewing — that's <NoteStream>'s job. We only
// fetch on startEdit, to populate the form.
export function useNoteEditor(id: string) {
  const { title, folder, description, content, visibility, isShared, populate, toUpdateInput } = useNoteForm()
  const notesApi = useNotesApi()
  const { confirm } = useConfirm()

  const editing = ref(false)
  const saving = ref(false)
  const loadingEdit = ref(false)

  // Bumped on every successful save; used as the :key on <NoteStream> so it
  // remounts and re-fetches the freshly-saved content.
  const version = ref(0)

  async function startEdit() {
    if (loadingEdit.value) return
    loadingEdit.value = true
    try {
      populate(await notesApi.getNote(id))
      editing.value = true
    }
    finally { loadingEdit.value = false }
  }

  async function saveEdit() {
    if (!title.value.trim() || saving.value) return
    saving.value = true
    try {
      await notesApi.updateNote(id, toUpdateInput())
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
    await notesApi.deleteNote(id)
    await navigateTo('/')
  }

  return {
    editing,
    title,
    folder,
    description,
    content,
    visibility,
    isShared,
    saving,
    loadingEdit,
    version,
    startEdit,
    saveEdit,
    deleteNote
  }
}
