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

type Meta = { id: string, title: string, folder: string | null, updated_at: string }
type ChunkAst = Awaited<ReturnType<typeof parseMarkdown>>['body']

const props = defineProps<{ id: string }>()

const meta = ref<Meta | null>(null)
const chunks = ref<ChunkAst[]>([])
const done = ref(false)
const notFound = ref(false)
const error = ref<string | null>(null)

const proseRef = ref<HTMLElement | null>(null)
// Full note source (raw markdown, including any `<!-- collapsed -->`
// markers we add to heading lines). This is the single source of
// truth for both checkbox toggles and heading folds — the markdown
// is the database of record, no localStorage shadow state.
const sourceContent = ref<string | null>(null)
let savePending: Promise<void> | null = null

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
              // remark-gfm tags task-list checkboxes with `disabled`,
              // so the rendered <input> can't be clicked. We want
              // them interactive in view mode — strip the prop in
              // the AST so MDCRenderer never sets the attribute.
              enableCheckboxes(parsed.body)
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

// Walks the parsed MDC AST and removes `disabled` from every
// `<input type="checkbox">` node so the rendered checkbox is
// interactive. Mutates in place — fine because we own the body
// object until it's pushed into `chunks`.
function enableCheckboxes(node: { tag?: string, props?: Record<string, unknown>, children?: unknown[] } | null | undefined) {
  if (!node || typeof node !== 'object') return
  if (node.tag === 'input' && node.props && 'disabled' in node.props) {
    delete node.props.disabled
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) enableCheckboxes(c as Parameters<typeof enableCheckboxes>[0])
  }
}

// Fetch the raw note source once on mount / id-change and cache it
// in `sourceContent`. The streaming endpoint expands `[[wiki-links]]`
// before chunking, so we can't reconstruct the source from chunks —
// we need the original to compute fold state and to PUT modifications
// back without losing wiki-links.
async function fetchSource() {
  try {
    const note = await $fetch<{ content: string }>(`/api/notes/${props.id}`)
    sourceContent.value = note.content
  }
  catch { sourceContent.value = null }
  // Explicit apply once the source is in. Belt-and-suspenders next
  // to the watcher: ensures fold state lands even if the watcher's
  // schedule fires earlier than the DOM has the headings.
  scheduleApply()
}

// Drives a single in-flight PUT so rapid clicks don't race. We
// catch on the chain so a single failed save doesn't poison every
// subsequent toggle (a `.then` on a rejected promise silently
// no-ops, which would mean future markers never reach the DB).
function persistContent() {
  if (sourceContent.value === null) return
  const prev = savePending ?? Promise.resolve()
  const snapshot = sourceContent.value
  savePending = prev.catch(() => {}).then(() =>
    $fetch(`/api/notes/${props.id}`, {
      method: 'PUT',
      body: { content: snapshot }
    }).then(() => undefined)
  )
}

// Walks the source line-by-line (skipping fenced code) and yields
// every heading line with its document-order index, the level (1-6),
// and the trailing `<!-- collapsed -->` marker if any. Used by both
// the collapsed-state computation and the toggle write path so the
// two stay in lockstep.
const COLLAPSED_RE = /<!--\s*collapsed\s*-->/

function* iterHeadings(content: string): Generator<{ idx: number, line: number, level: number, text: string, marker: boolean }> {
  const lines = content.split('\n')
  let inFence = false
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!m) continue
    const marker = COLLAPSED_RE.test(m[2]!)
    const text = m[2]!.replace(COLLAPSED_RE, '').trim()
    yield { idx, line: i, level: m[1]!.length, text, marker }
    idx++
  }
}

// Document-order indices of headings whose source line carries the
// `<!-- collapsed -->` marker. Recomputed automatically when source
// changes — that's what drives the visual fold state.
const collapsedIndices = computed<Set<number>>(() => {
  const set = new Set<number>()
  if (!sourceContent.value) return set
  for (const h of iterHeadings(sourceContent.value)) {
    if (h.marker) set.add(h.idx)
  }
  return set
})

function toggleHeadingByIndex(targetIdx: number) {
  if (sourceContent.value === null) return
  const lines = sourceContent.value.split('\n')
  for (const h of iterHeadings(sourceContent.value)) {
    if (h.idx !== targetIdx) continue
    const hashes = '#'.repeat(h.level)
    lines[h.line] = h.marker
      ? `${hashes} ${h.text}`
      : `${hashes} ${h.text} <!-- collapsed -->`
    sourceContent.value = lines.join('\n')
    persistContent()
    return
  }
}

// Walks the rendered prose container, treats it as a flat sequence
// of "blocks" (direct children of every chunk) in document order,
// and applies the current collapse state. For each heading we:
//   1. assign a stable key = `<TAG>:<text>` (with `#N` for duplicates)
//   2. wire a click handler the first time we see it
//   3. show or hide everything that follows until a heading at the
//      same or higher level is reached.
// Designed to be re-run after each new chunk lands so freshly
// arrived content respects already-collapsed sections.
// Tags treated as top-level "blocks" for fold logic. A heading
// boundary folds everything that follows up to the next heading at
// the same/higher level.
const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'HR'])
// Container tags whose descendants should be treated as part of an
// already-collected outer block (not as their own blocks). E.g., a
// <p> inside an <li> belongs to the <ul>, not to the document flow.
const CONTAINER_TAGS = new Set([...BLOCK_TAGS, 'LI', 'TR', 'TD', 'TH', 'THEAD', 'TBODY', 'TFOOT'])

function collectBlocks(): HTMLElement[] {
  if (!proseRef.value) return []
  const all = Array.from(proseRef.value.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, pre, table, hr'
  ))
  return all.filter((el) => {
    // Reject elements nested inside another block / list item — they
    // shouldn't be standalone fold targets, the outer block is.
    let p = el.parentElement
    while (p && p !== proseRef.value) {
      if (CONTAINER_TAGS.has(p.tagName)) return false
      p = p.parentElement
    }
    return true
  })
}

// Lucide `chevron-down` glyph. Inlined as SVG markup so we avoid
// pulling a Vue component into a JS-driven DOM injection path; the
// `currentColor` stroke makes it pick up the heading's text color.
const CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'

// Wrap a block in `<div class="kb-fold-block">` so the grid-rows
// animation has something to drive. Idempotent — if the wrapper is
// already there we just return it. This handles re-applies after
// each streamed chunk without doubling up.
function ensureFoldWrapper(el: HTMLElement): HTMLElement {
  const parent = el.parentElement
  if (parent && parent.classList.contains('kb-fold-block')) return parent
  const wrapper = document.createElement('div')
  wrapper.className = 'kb-fold-block'
  parent?.insertBefore(wrapper, el)
  wrapper.appendChild(el)
  return wrapper
}

function applyCollapseState() {
  if (!proseRef.value) return
  const blocks = collectBlocks()

  // Document-order index across the rendered headings — matches the
  // index used by `iterHeadings` over the source, so the same N
  // identifies the same heading on both sides.
  let headingIndex = 0
  let hideUntilLevel = 0
  for (const el of blocks) {
    const m = el.tagName.match(/^H([1-6])$/)

    // Headings at same/higher level close the outer fold *before* we
    // decide whether this element itself is hidden.
    if (m) {
      const level = Number(m[1])
      if (hideUntilLevel > 0 && level <= hideUntilLevel) hideUntilLevel = 0
    }

    // Each block sits in a grid wrapper that animates between 1fr
    // and 0fr — that's what produces the smooth height transition.
    const wrapper = ensureFoldWrapper(el)
    wrapper.classList.toggle('is-folded', hideUntilLevel > 0)

    if (m) {
      const myIdx = headingIndex
      headingIndex++
      const isCollapsed = collapsedIndices.value.has(myIdx)

      el.classList.add('kb-foldable')
      el.dataset.collapseIndex = String(myIdx)
      el.classList.toggle('is-collapsed', isCollapsed)

      if (!el.querySelector(':scope > .kb-fold-chevron')) {
        const chev = document.createElement('span')
        chev.className = 'kb-fold-chevron'
        chev.innerHTML = CHEVRON_SVG
        chev.setAttribute('aria-hidden', 'true')
        el.prepend(chev)
      }

      if (!el.dataset.collapseWired) {
        el.dataset.collapseWired = '1'
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.collapseIndex)
          if (Number.isNaN(idx)) return
          toggleHeadingByIndex(idx)
          // `collapsedIndices` is computed from `sourceContent`, so
          // mutating source already invalidates it; the watcher on
          // `sourceContent` re-runs apply.
        })
      }

      // This heading opens its own fold (for everything below it).
      const level = Number(m[1])
      if (isCollapsed && hideUntilLevel === 0) {
        hideUntilLevel = level
      }
    }
  }
}

// MDCRenderer has an async setup() — its rendered content lands in
// the DOM *after* Vue's normal post-flush watchers fire. So we
// observe the real DOM instead, and re-run apply on any childList
// mutation in the prose container. `applying` flag prevents the
// observer from re-firing on our own injections (wrappers + chevron
// spans).
let observer: MutationObserver | null = null
let applying = false
function scheduleApply() {
  if (applying) return
  applying = true
  Promise.resolve().then(() => {
    try { applyCollapseState() }
    finally { applying = false }
  })
}

onMounted(() => {
  if (proseRef.value) {
    observer = new MutationObserver(scheduleApply)
    observer.observe(proseRef.value, { childList: true, subtree: true })
  }
  // Fetch raw source in parallel with the stream so collapse state
  // is available as soon as possible. The stream paints the visible
  // markdown progressively; this single GET is just to know which
  // headings should start folded and to provide the buffer for
  // future toggles.
  fetchSource()
  load().finally(() => scheduleApply())
  scheduleApply()
})
watch(() => props.id, () => {
  sourceContent.value = null
  fetchSource()
  load()
})
// Source mutations (initial fetch, heading toggle, checkbox toggle)
// invalidate `collapsedIndices` — re-apply so the DOM reflects the
// new state without a full re-render. `flush: 'post'` runs the
// callback after Vue has patched any pending DOM updates, so the
// rendered headings are guaranteed to be in the DOM by the time
// applyCollapseState walks the prose container.
watch(sourceContent, () => scheduleApply(), { flush: 'post' })
onBeforeUnmount(() => {
  controller?.abort()
  observer?.disconnect()
})

// Walks the markdown line-by-line, skipping fenced code blocks, and
// flips the Nth GFM task-list checkbox. Returns the new source or
// `null` if the index doesn't match — which would mean the DOM and
// the cached content drifted, in which case we silently bail rather
// than corrupt the note.
function toggleNthTask(content: string, n: number, checked: boolean): string | null {
  const lines = content.split('\n')
  let inFence = false
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(\s*[-*+] +)\[([ xX])\]/)
    if (!m) continue
    if (count === n) {
      lines[i] = m[1] + (checked ? '[x]' : '[ ]') + line.slice(m[0].length)
      return lines.join('\n')
    }
    count++
  }
  return null
}

async function onCheckboxChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!(input instanceof HTMLInputElement)) return
  if (input.type !== 'checkbox') return
  if (!proseRef.value) return

  // Index = position among checkboxes in document order. In rendered
  // markdown the only checkboxes come from GFM task lists, so this
  // index maps 1:1 onto the Nth `- [ ]` / `- [x]` line in the source.
  const allBoxes = Array.from(
    proseRef.value.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  )
  const n = allBoxes.indexOf(input)
  if (n < 0) return

  const newChecked = input.checked

  try {
    if (sourceContent.value === null) await fetchSource()
    if (sourceContent.value === null) return
    const next = toggleNthTask(sourceContent.value, n, newChecked)
    if (next === null) return
    sourceContent.value = next
    persistContent()
    await savePending
  }
  catch {
    // Roll back the visual toggle if the save failed.
    input.checked = !newChecked
  }
}

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
    <div ref="proseRef" class="prose prose-sm dark:prose-invert max-w-none" @change="onCheckboxChange">
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
