// Client-side use-case for editing a single note. Holds the edit-specific
// concerns (view-mode toggle, delete-with-confirm) and drives the shared
// form state (useNoteForm) + the typed API wrapper (useNotesApi).
//
// The note is NOT fetched for viewing — the page renders it from its own
// SSR fetch. We only fetch on startEdit, to populate the form.
export function useNoteEditor(id: string) {
  const { title, folder, description, content, visibility, isShared, populate, toUpdateInput } = useNoteForm()
  const notesApi = useNotesApi()
  const { confirm } = useConfirm()

  const editing = ref(false)
  const saving = ref(false)
  const loadingEdit = ref(false)

  async function startEdit() {
    if (loadingEdit.value) return
    loadingEdit.value = true
    try {
      populate(await notesApi.getNote(id))
      editing.value = true
    }
    finally { loadingEdit.value = false }
  }

  // Returns the saved note so the page can refresh its view synchronously
  // (fresh content / updated_at / is_shared) without a second fetch.
  async function saveEdit() {
    if (!title.value.trim() || saving.value) return
    saving.value = true
    try {
      const updated = await notesApi.updateNote(id, toUpdateInput())
      editing.value = false
      return updated
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
    startEdit,
    saveEdit,
    deleteNote
  }
}
