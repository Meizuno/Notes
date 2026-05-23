<script setup lang="ts">
type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

const route = useRoute()

// Pre-fill from query params:
//   ?title=Foo  — entry point for "create note with this title".
//   ?folder=A/B — "new note in this folder" entry points.
const title = ref(String(route.query.title ?? ''))
const folder = ref(String(route.query.folder ?? ''))
const content = ref('')
const visibility = ref<Visibility>('PROTECTED')
const saving = ref(false)

async function save() {
  if (!title.value.trim() || saving.value) return
  saving.value = true
  try {
    const note = await $fetch<{ id: string }>('/api/notes', {
      method: 'POST',
      body: {
        title: title.value,
        folder: folder.value.trim() || null,
        content: content.value,
        visibility: visibility.value
      }
    })
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
      v-model:content="content"
      v-model:visibility="visibility"
      :saving="saving"
      submit-label="Save note"
      @submit="save"
      @cancel="navigateTo('/')"
    />
  </div>
</template>
