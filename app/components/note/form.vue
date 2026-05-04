<script setup lang="ts">
type FlatNote = { id: number, title: string, folder: string | null }

const props = defineProps<{
  saving?: boolean
  submitLabel?: string
}>()

const emit = defineEmits<{
  submit: []
  cancel: []
}>()

const title = defineModel<string>('title', { default: '' })
const folder = defineModel<string>('folder', { default: '' })
const content = defineModel<string>('content', { default: '' })

const mode = ref<'edit' | 'preview'>('edit')
const editorRef = useTemplateRef<any>('editor')
const { displayContent } = useImagePaste(content, editorRef)

const { format, formatting } = useMarkdownFormatter()
const toast = useToast()

// Folder suggestions: every existing folder path plus its parent
// prefixes. Reuses the sidebar's cached fetch (same `key`) so no
// extra HTTP round-trip.
const { data: notes } = await useFetch<FlatNote[]>('/api/notes/tree', {
  key: 'sidebar-tree'
})

const folderOptions = computed(() => {
  const set = new Set<string>()
  for (const n of notes.value ?? []) {
    if (!n.folder) continue
    let cumulative = ''
    for (const part of n.folder.split('/').filter(Boolean)) {
      cumulative = cumulative ? `${cumulative}/${part}` : part
      set.add(cumulative)
    }
  }
  return [...set].sort()
})

async function onFormat() {
  if (!content.value.trim() || formatting.value) return
  try {
    content.value = await format(content.value)
  }
  catch (err) {
    toast.add({ title: 'Format failed', description: (err as Error).message, color: 'error' })
  }
}

function onSubmit() {
  if (!title.value.trim() || props.saving) return
  emit('submit')
}
</script>

<template>
  <form class="flex flex-col gap-4 h-full" @submit.prevent="onSubmit">
    <UInput v-model="title" placeholder="Note title" size="lg" class="shrink-0" />
    <UInputMenu
      v-model="folder"
      :items="folderOptions"
      placeholder="Folder (e.g. Programming/Languages, leave empty for root)"
      icon="i-lucide-folder"
      size="sm"
      create-item
      class="shrink-0"
    />

    <!-- Mode toggle + actions -->
    <div class="flex items-center shrink-0">
      <div class="flex gap-1 rounded-lg bg-muted p-1">
        <UButton size="xs" :variant="mode === 'edit' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-pencil" label="Edit" @click="mode = 'edit'" />
        <UButton size="xs" :variant="mode === 'preview' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-eye" label="Preview" @click="mode = 'preview'" />
      </div>
      <div class="flex-1" />
      <div class="flex gap-2">
        <UButton
          v-if="mode === 'edit'"
          variant="ghost"
          color="neutral"
          icon="i-lucide-wand-2"
          label="Format"
          size="xs"
          :loading="formatting"
          :disabled="!displayContent.trim()"
          @click="onFormat"
        />
        <UButton variant="ghost" color="neutral" label="Cancel" size="xs" @click="emit('cancel')" />
        <UButton type="submit" color="primary" icon="i-lucide-save" :label="submitLabel ?? 'Save'" size="xs" :loading="saving" :disabled="!title.trim()" />
      </div>
    </div>

    <!-- Editor / Preview — fills remaining space -->
    <div class="flex-1 min-h-0 overflow-hidden mb-2">
      <UTextarea
        v-if="mode === 'edit'"
        ref="editor"
        v-model="displayContent"
        placeholder="Write your note in markdown…"
        class="font-mono text-sm w-full h-full [&>div]:h-full [&_textarea]:h-full [&_textarea]:resize-none"
      />
      <div v-else class="h-full overflow-y-auto rounded-xl border border-default px-6 py-4">
        <div v-if="content" class="prose prose-sm dark:prose-invert max-w-none">
          <MDC :value="content" />
        </div>
        <p v-else class="text-muted italic">Nothing to preview</p>
      </div>
    </div>

  </form>
</template>
