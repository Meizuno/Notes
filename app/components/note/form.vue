<script setup lang="ts">
import type { Visibility } from '#shared/schemas/note'

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
const description = defineModel<string>('description', { default: '' })
const content = defineModel<string>('content', { default: '' })
const visibility = defineModel<Visibility>('visibility', { default: 'PROTECTED' })

// Single source of truth for the visibility dropdown's icon + label
// per tier; both the trigger button and the menu items pull from it.
const VISIBILITY_META: Record<Visibility, { label: string, icon: string, description: string }> = {
  PRIVATE:   { label: 'Private',   icon: 'i-lucide-lock',   description: 'Only you can read' },
  PROTECTED: { label: 'Protected', icon: 'i-lucide-users',  description: 'Any signed-in user can read' },
  PUBLIC:    { label: 'Public',    icon: 'i-lucide-globe',  description: 'Anyone with the link can read' }
}
const visibilityMenu = computed(() =>
  (['PRIVATE', 'PROTECTED', 'PUBLIC'] as const).map(v => ({
    label: VISIBILITY_META[v].label,
    icon: VISIBILITY_META[v].icon,
    description: VISIBILITY_META[v].description,
    onSelect: () => { visibility.value = v }
  }))
)

const mode = ref<'edit' | 'preview'>('edit')
const editorRef = useTemplateRef<{ textareaRef?: HTMLTextAreaElement | null, $el?: HTMLElement | null }>('editor')
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

    <!-- Optional short summary. Two-row textarea so a sentence or two
         fits without scrolling; max 500 chars enforced server-side. -->
    <UTextarea
      v-model="description"
      placeholder="Optional description — a sentence or two for list / search previews"
      size="sm"
      :rows="2"
      maxlength="500"
      autoresize
      class="shrink-0 w-full"
    />

    <!-- Mode toggle + visibility menu + actions. flex-wrap lets the
         action group drop to a second line when the viewport can't
         fit all items on one row (mobile / narrow split panes). -->
    <div class="flex items-center flex-wrap gap-x-3 gap-y-2 shrink-0">
      <div class="flex gap-1 rounded-lg bg-muted p-1">
        <UButton size="xs" :variant="mode === 'edit' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-pencil" label="Edit" @click="mode = 'edit'" />
        <UButton size="xs" :variant="mode === 'preview' ? 'solid' : 'ghost'" color="primary" icon="i-lucide-eye" label="Preview" @click="mode = 'preview'" />
      </div>
      <!-- Visibility tier (PRIVATE / PROTECTED / PUBLIC). Dropdown
           shows the active tier's icon + label; clicking opens the
           three-option menu. Compact enough to share the row with the
           edit/preview toggle and the action buttons on a narrow
           viewport (the wrap rules above handle overflow). -->
      <UDropdownMenu :items="visibilityMenu" :ui="{ content: 'w-56' }">
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          :icon="VISIBILITY_META[visibility].icon"
          :label="VISIBILITY_META[visibility].label"
          trailing-icon="i-lucide-chevron-down"
        />
      </UDropdownMenu>
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
