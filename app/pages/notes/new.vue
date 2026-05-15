<script setup lang="ts">
const route = useRoute()

// Pre-fill from query params:
//   ?title=Foo  — clicking a dangling [[Foo]] wiki-link lands here
//                 with the title primed.
//   ?folder=A/B — "new note in this folder" entry points.
const title = ref(String(route.query.title ?? ''))
const folder = ref(String(route.query.folder ?? ''))
const content = ref('')
const isPublic = ref(false)
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
        public: isPublic.value
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
      v-model:public="isPublic"
      :saving="saving"
      submit-label="Save note"
      @submit="save"
      @cancel="navigateTo('/')"
    />
  </div>
</template>
