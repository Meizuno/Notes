<script setup lang="ts">
type FlatNote = { id: string, title: string, folder: string | null }

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
const isPublic = defineModel<boolean>('public', { default: false })

const mode = ref<'edit' | 'preview'>('edit')
const editorRef = useTemplateRef<any>('editor')
const { displayContent } = useImagePaste(content, editorRef)

const { format, formatting } = useMarkdownFormatter()
const toast = useToast()

// Folder suggestions: every existing folder path plus its parent
// prefixes. Reuses the sidebar's cached fetch (same `key`) so no
// extra HTTP round-trip.
const { data: notes } = await useFetch<FlatNote[]>('/api/notes/tree')

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
    <div class="shrink-0">
      <UInput
        v-model="folder"
        placeholder="Folder (e.g. Programming/Languages, leave empty for root)"
        icon="i-lucide-folder"
        size="sm"
        list="folder-suggestions"
        autocomplete="off"
        class="w-full"
      />
      <!-- Native autocomplete: the browser shows a dropdown of
           existing folders as the user types, but the field still
           accepts any free-form text, so creating a brand new path
           is "type it and submit." Slashes nest folders implicitly. -->
      <datalist id="folder-suggestions">
        <option v-for="opt in folderOptions" :key="opt" :value="opt" />
      </datalist>
      <p class="text-xs text-muted mt-1 px-1">
        Type any path — slashes nest (e.g. <span class="font-mono">Programming/Languages</span>). Existing folders autocomplete. Leave empty for root.
      </p>
    </div>

    <!-- Mode toggle + public toggle + actions -->
    <div class="flex items-center gap-3 shrink-0">
      <div class="flex gap-1 rounded-lg bg-muted p-1">
        <UButton size="xs" :variant="mode === 'edit' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-pencil" label="Edit" @click="mode = 'edit'" />
        <UButton size="xs" :variant="mode === 'preview' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-eye" label="Preview" @click="mode = 'preview'" />
      </div>
      <!-- Public toggle: off = note is private to the workspace (the
           default), on = anyone with the URL can read it. Wiring the
           anonymous-view route is a follow-up; the column itself
           lives on the model now. -->
      <label class="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
        <USwitch v-model="isPublic" size="xs" />
        <UIcon :name="isPublic ? 'i-lucide-globe' : 'i-lucide-lock'" class="size-3.5" />
        {{ isPublic ? 'Public' : 'Private' }}
      </label>
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
