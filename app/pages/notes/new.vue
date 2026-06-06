<script setup lang="ts">
const route = useRoute()
const { createNote } = useNotesApi()
const { title, folder, description, content, visibility, toCreateInput } = useNoteForm()

// Pre-fill from query params:
//   ?title=Foo  — entry point for "create note with this title".
//   ?folder=A/B — "new note in this folder" entry points.
title.value = String(route.query.title ?? '')
folder.value = String(route.query.folder ?? '')

const saving = ref(false)

async function save() {
  if (!title.value.trim() || saving.value) return
  saving.value = true
  try {
    const note = await createNote(toCreateInput())
    await navigateTo(`/notes/${note.id}`)
  }
  finally { saving.value = false }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 pt-4 pb-2 h-full overflow-hidden">
    <NoteForm
      v-model:title="title"
      v-model:folder="folder"
      v-model:description="description"
      v-model:content="content"
      v-model:visibility="visibility"
      :saving="saving"
      submit-label="Save note"
      @submit="save"
      @cancel="navigateTo('/')"
    />
  </div>
</template>
