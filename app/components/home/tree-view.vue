<script setup lang="ts">
// Folder tree of the vault, rendered with Nuxt UI's <UTree>.
// Folders start collapsed; open them individually, and a "Collapse all"
// action (shown once anything is open) tidies them back — there is no
// bulk expand. Expand state persists across SPA navigation via a useState
// key and resets to collapsed on a full reload.

type FlatNote = { id: string, title: string, folder: string | null, created_at: string }

type TreeItem = {
  label: string
  value: string
  icon?: string
  // Drives the within-folder sort. Folders carry the max createdAt
  // of any descendant note so folder ordering follows "newest first"
  // too; notes carry their own row's created_at.
  createdAt?: string
  children?: TreeItem[]
  onSelect?: (e: Event) => void
}

// Same `key` as the home page's prefetch so the two tree-view instances
// (sidebar + small) and the prefetch all share one request, not three.
const { data: notes } = await useFetch<FlatNote[]>('/api/notes/tree', { key: 'sidebar-tree' })
const route = useRoute()
const router = useRouter()

// Highlight the active note when we're sitting on /notes/<id>.
const activeNoteId = computed(() => {
  const m = route.path.match(/^\/notes\/([^/]+)/)
  return m && m[1] ? m[1] : null
})

// UTree v-model:expanded wants an array of keys. Starts empty (all
// collapsed); persists across SPA nav via this key and resets to
// collapsed on a full reload.
const expanded = useState<string[]>('home-tree-expanded', () => [])

// Collapse-only: folders open individually, and this is the single bulk
// action — there is no "expand all".
function collapseAll() {
  expanded.value = []
}

const items = computed<TreeItem[]>(() => {
  const root: TreeItem = { label: '', value: '__root__', children: [] }
  for (const n of notes.value ?? []) {
    const parts = n.folder ? n.folder.split('/').filter(Boolean) : []
    let parent = root
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      let folder = parent.children!.find(c => c.children && c.value === acc)
      if (!folder) {
        folder = {
          label: part,
          value: acc,
          icon: 'i-lucide-folder',
          children: []
        }
        parent.children!.push(folder)
      }
      // Bubble each note's createdAt up to every ancestor folder so
      // a folder's effective createdAt is the OLDEST note inside —
      // matches the "ascending = oldest first" sort the user sees.
      if (!folder.createdAt || n.created_at < folder.createdAt) {
        folder.createdAt = n.created_at
      }
      parent = folder
    }
    // Per-item onSelect: clicks on note rows navigate. Folders have no
    // onSelect, so clicking them just toggles expand via UTree's
    // built-in behavior — keeps the routing logic out of the v-model
    // emit, which gives us the item object (not the value).
    const noteId = n.id
    parent.children!.push({
      label: n.title,
      value: noteId,
      icon: 'i-lucide-file-text',
      createdAt: n.created_at,
      onSelect: () => router.push(`/notes/${noteId}`)
    })
  }
  // Sort children: folders first (so structure reads at a glance),
  // then within each kind by createdAt asc — oldest content first.
  // Fallback to label for items missing createdAt (defensive).
  const sortRecursive = (node: TreeItem) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      const aFolder = !!a.children
      const bFolder = !!b.children
      if (aFolder !== bFolder) return aFolder ? -1 : 1
      if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt)
      return a.label.localeCompare(b.label)
    })
    node.children.forEach(sortRecursive)
  }
  sortRecursive(root)
  return root.children ?? []
})

// Selection is an item object (reka-ui semantics), not a string. Sync
// it from the route so the active note row stays highlighted as we
// navigate. The getKey prop on <UTree> matches items by `value`, so
// any item with the right value works as the selected reference.
const selected = ref<TreeItem | undefined>()
watchEffect(() => {
  if (!activeNoteId.value) {
    selected.value = undefined
    return
  }
  const find = (list: TreeItem[]): TreeItem | undefined => {
    for (const it of list) {
      if (!it.children && it.value === activeNoteId.value) return it
      if (it.children) {
        const f = find(it.children)
        if (f) return f
      }
    }
    return undefined
  }
  selected.value = find(items.value)
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-3xl mx-auto px-4 py-4">
      <div class="mb-2 flex items-center gap-2 text-sm">
        <span class="text-muted">
          {{ notes?.length ?? 0 }} note{{ (notes?.length ?? 0) === 1 ? '' : 's' }}
        </span>
        <UButton
          v-if="expanded.length > 0"
          icon="i-lucide-chevrons-down-up"
          variant="ghost"
          color="neutral"
          size="xs"
          class="ml-auto"
          label="Collapse all"
          @click="collapseAll"
        />
      </div>

      <UTree
        v-if="items.length"
        v-model="selected"
        v-model:expanded="expanded"
        :items="items"
        :get-key="(item: TreeItem) => item.value"
        size="md"
        color="primary"
      />

      <div v-else class="grid place-items-center py-20">
        <div class="flex flex-col items-center gap-3 text-center">
          <UIcon name="i-lucide-folder-tree" class="size-10 text-muted" />
          <p class="text-sm text-muted">No notes yet</p>
          <UButton
            to="/notes/new"
            icon="i-lucide-plus"
            label="Create your first note"
            size="sm"
            color="primary"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<!-- Expand animation. Non-scoped so the rule matches UTree's internal
     <ul data-slot="listWithChildren">. v-if removes the element on
     collapse, so only the enter direction animates — acceptable. -->
<style>
[data-slot="listWithChildren"] {
  animation: home-tree-expand 180ms ease-out;
  transform-origin: top;
  overflow: hidden;
}
@keyframes home-tree-expand {
  from {
    opacity: 0;
    transform: translateY(-4px) scaleY(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-slot="listWithChildren"] { animation: none; }
}
</style>
