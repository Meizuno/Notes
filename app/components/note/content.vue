<script setup lang="ts">
// Note body, rendered in a single declarative pass — no streaming, no
// MutationObserver, no post-render DOM injection. The markdown is parsed
// once into an AST, nested into heading sections (buildSectionTree), and
// rendered recursively by <NoteSection>; folds are plain reactive state.
//
// The parse runs on the server (via useAsyncData, serialized to the client
// so it isn't repeated), but the body is rendered <ClientOnly>: MDC's table
// components hydrate inconsistently (server fragment vs client <thead>),
// which throws mismatch warnings on any note with a table. The page's SEO
// head (title/description) is still server-rendered in the page itself.
//
// Fold state lives in the markdown source itself (`<!-- collapsed -->`
// markers — the DB of record). Toggling a fold or a task checkbox rewrites
// the source and persists it; the page remounts this component (keyed on the
// save version) when an edit changes the content, so the prop need not be
// watched.
import { NOTE_FOLD_KEY, type MdcBody, type MdcNode, type NoteFoldApi } from '~/utils/note-fold'

// `updatedAt` is part of the parse cache key (and the page remounts this
// component on it after a save), so an edit busts the cached AST.
const props = defineProps<{ id: string, content: string, updatedAt: string }>()
const notesApi = useNotesApi()

const source = ref(props.content)
const proseRef = ref<HTMLElement | null>(null)

// Parse once, on the server too, so the body is real HTML in the payload and
// hydrates without re-parsing. enableCheckboxes strips the `disabled` GFM
// puts on task checkboxes so they stay interactive in view mode.
const astData = useAsyncData(`note-ast-${props.id}-${props.updatedAt}`, async () => {
  const { body } = await parseMarkdown(source.value)
  enableCheckboxes(body)
  return body
})
const astBody = astData.data

const collapsedIndices = computed(() => getCollapsedIndices(source.value))
const tree = computed(() => buildSectionTree<MdcNode>(astBody.value?.children ?? []))
const isEmpty = computed(() => !tree.value.lead.length && !tree.value.sections.length)

// Wrap a slice of AST nodes back into a body MDCRenderer can render (clone
// the parsed body so its `type` carries over).
function rootOf(children: MdcNode[]): MdcBody {
  return { ...(astBody.value as MdcBody), children }
}

// Single in-flight PUT so rapid toggles don't race; a failed save doesn't
// poison later ones (we swallow on the chain).
let savePending: Promise<void> | null = null
function persist() {
  const snapshot = source.value
  const prev = savePending ?? Promise.resolve()
  savePending = prev.catch(() => {}).then(() =>
    notesApi.updateNote(props.id, { content: snapshot }).then(() => undefined)
  )
}

function toggle(index: number) {
  const next = toggleHeadingCollapsed(source.value, index)
  if (next === source.value) return
  source.value = next
  persist()
}

provide<NoteFoldApi>(NOTE_FOLD_KEY, {
  isCollapsed: i => collapsedIndices.value.has(i),
  toggle,
  rootOf
})

async function onCheckboxChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox' || !proseRef.value) return
  // Index among checkboxes in document order maps 1:1 onto the Nth task line.
  const boxes = Array.from(proseRef.value.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
  const n = boxes.indexOf(input)
  if (n < 0) return
  const newChecked = input.checked
  try {
    const next = toggleNthTask(source.value, n, newChecked)
    if (next === null) return
    source.value = next
    persist()
    await savePending
  }
  catch {
    input.checked = !newChecked // roll back the visual toggle on save failure
  }
}

// Strip `disabled` from task-list checkbox inputs in the AST so they're
// clickable. Mutates in place — we own the freshly parsed body.
function enableCheckboxes(node: unknown): void {
  if (!node || typeof node !== 'object') return
  const n = node as { tag?: string, props?: Record<string, unknown>, children?: unknown[] }
  if (n.tag === 'input' && n.props && 'disabled' in n.props) delete n.props.disabled
  if (Array.isArray(n.children)) for (const c of n.children) enableCheckboxes(c)
}

// Resolve the parse before setup finishes so SSR includes the body. Kept
// last: provide() above must run while the setup instance is still active
// (before any await).
await astData
</script>

<template>
  <div ref="proseRef" class="prose prose-sm dark:prose-invert max-w-none" @change="onCheckboxChange">
    <ClientOnly>
      <MDCRenderer v-if="tree.lead.length" :body="rootOf(tree.lead)" />
      <NoteSection v-for="s in tree.sections" :key="s.index" :section="s" />
      <p v-if="isEmpty" class="text-muted italic text-sm">No content yet. Click edit to add a note.</p>
    </ClientOnly>
  </div>
</template>
