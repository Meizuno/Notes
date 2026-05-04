<script setup lang="ts">
// Client-only component that streams a note (metadata + content)
// from `/api/notes/<id>/stream`. The first NDJSON line carries
// metadata (title, folder, date) so the heading paints quickly;
// later lines carry paragraph chunks of the markdown body, each
// parsed in the parent and rendered via `<MDCRenderer>` so no chunk
// waits on async setup of a sibling.
//
// `.client.vue` → never SSRs, never blocks page transition. Page
// mounts to a skeleton; metadata and chunks fill in over the wire.

type Meta = { id: number, title: string, folder: string | null, updated_at: string }
type ChunkAst = Awaited<ReturnType<typeof parseMarkdown>>['body']

const props = defineProps<{ id: number }>()

const meta = ref<Meta | null>(null)
const chunks = ref<ChunkAst[]>([])
const done = ref(false)
const notFound = ref(false)
const error = ref<string | null>(null)

let controller: AbortController | null = null

async function load() {
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal

  meta.value = null
  chunks.value = []
  done.value = false
  notFound.value = false
  error.value = null

  try {
    const res = await fetch(`/api/notes/${props.id}/stream`, { signal })
    if (res.status === 404) {
      notFound.value = true
      done.value = true
      return
    }
    if (!res.ok || !res.body) {
      error.value = `HTTP ${res.status}`
      done.value = true
      return
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      if (signal.aborted) {
        await reader.cancel()
        return
      }
      buffer += dec.decode(value, { stream: true })

      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line) {
          try {
            const record = JSON.parse(line) as { meta?: Meta, text?: string }
            if (record.meta) {
              meta.value = record.meta
            }
            else if (record.text != null) {
              const parsed = await parseMarkdown(record.text)
              if (signal.aborted) return
              chunks.value.push(parsed.body)
            }
          }
          catch { /* skip malformed line */ }
        }
        nl = buffer.indexOf('\n')
      }
    }
  }
  catch (e) {
    if ((e as Error).name === 'AbortError') return
    error.value = (e as Error).message
  }
  finally {
    if (!signal.aborted) done.value = true
  }
}

onMounted(load)
watch(() => props.id, load)
onBeforeUnmount(() => controller?.abort())

const formattedDate = computed(() =>
  meta.value
    ? new Date(meta.value.updated_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
)
</script>

<template>
  <div v-if="notFound" class="text-sm text-muted">Note not found.</div>
  <div v-else>
    <!-- Title row: title on the left, parent-supplied action buttons
         on the right. Skeleton until the first NDJSON line lands; the
         actions slot is rendered immediately so Edit/Delete remain
         interactive even before metadata arrives. -->
    <div class="flex items-start justify-between gap-3 mb-4">
      <h1 v-if="meta" class="text-2xl font-bold leading-tight min-w-0 flex-1">{{ meta.title }}</h1>
      <USkeleton v-else-if="!error" class="h-8 w-2/3 rounded" />
      <span v-else class="flex-1" />
      <div class="flex gap-1 shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <template v-if="meta">
      <p v-if="meta.folder" class="text-xs text-muted mb-1 flex items-center gap-1">
        <UIcon name="i-lucide-folder" class="size-3" />
        {{ meta.folder }}
      </p>
      <p class="text-xs text-muted mb-6">Last updated: {{ formattedDate }}</p>
    </template>
    <USkeleton v-else-if="!error" class="h-4 w-32 mb-6 rounded" />

    <!-- Body chunks. Each fades + slides + de-blurs in as it arrives. -->
    <div class="prose prose-sm dark:prose-invert max-w-none">
      <TransitionGroup name="chunk" tag="div">
        <div v-for="(body, i) in chunks" :key="i" class="chunk">
          <MDCRenderer :body="body" />
        </div>
      </TransitionGroup>
      <p v-if="meta && !chunks.length && done && !error" class="text-muted italic text-sm">No content yet. Click edit to add a note.</p>
      <p v-if="error" class="text-error text-sm">Failed to load: {{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.chunk-enter-from {
  opacity: 0;
  transform: translateY(6px);
  filter: blur(2px);
}
.chunk-enter-active {
  transition: opacity 240ms ease-out, transform 240ms ease-out, filter 240ms ease-out;
}
</style>
