<script setup lang="ts">
type Note = { id: string, title: string, folder: string | null, content: string, public: boolean, updated_at: string }

const route = useRoute()
const id = String(route.params.id)

// `version` is bumped on every successful edit and used as the `:key`
// on `<NoteStream>` so the component remounts and re-fetches the
// stream after a save.
const version = ref(0)

// Edit-mode state. The parent never fetches the note for *viewing* —
// that's the stream component's job. We only fetch when the user
// clicks "Edit", to populate the form.
const editing = ref(false)
const editTitle = ref('')
const editFolder = ref('')
const editContent = ref('')
const editPublic = ref(false)
const saving = ref(false)
const loadingEdit = ref(false)

async function startEdit() {
  if (loadingEdit.value) return
  loadingEdit.value = true
  try {
    const note = await $fetch<Note>(`/api/notes/${id}`)
    editTitle.value = note.title
    editFolder.value = note.folder ?? ''
    editContent.value = note.content
    editPublic.value = note.public
    editing.value = true
  }
  finally { loadingEdit.value = false }
}

async function saveEdit() {
  if (!editTitle.value.trim() || saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/notes/${id}`, {
      method: 'PUT',
      body: {
        title: editTitle.value,
        folder: editFolder.value.trim() || null,
        content: editContent.value,
        public: editPublic.value
      }
    })
    version.value++  // remount the stream so it shows the new content
    editing.value = false
  }
  finally { saving.value = false }
}

const { confirm } = useConfirm()

async function deleteNote() {
  const ok = await confirm({
    title: 'Delete note?',
    description: 'This note will be removed. This cannot be undone.',
    confirmLabel: 'Delete'
  })
  if (!ok) return
  await $fetch(`/api/notes/${id}`, { method: 'DELETE' })
  await navigateTo('/')
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4" :class="editing ? 'pt-4 pb-2 h-full overflow-hidden' : 'py-4'">
    <!-- Edit mode -->
    <template v-if="editing">
      <NoteForm
        v-model:title="editTitle"
        v-model:folder="editFolder"
        v-model:content="editContent"
        v-model:public="editPublic"
        :saving="saving"
        submit-label="Save"
        @submit="saveEdit"
        @cancel="editing = false"
      />
    </template>

    <!-- View mode -->
    <template v-else>
      <!-- Everything (metadata + body) streams from
           /api/notes/<id>/stream so navigation is instant and the
           page paints progressively as bytes arrive. The actions
           slot puts Edit/Delete inline with the title row. -->
      <NoteStream :id="id" :key="version">
        <template #actions>
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            color="neutral"
            size="sm"
            :loading="loadingEdit"
            @click="startEdit"
          />
          <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" @click="deleteNote" />
        </template>
      </NoteStream>
    </template>
  </div>
</template>
