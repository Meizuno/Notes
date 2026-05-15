<script setup lang="ts">
// Full-page tree of the vault — same data + recursion as the sidebar
// but with breathing room for desktop browsing. Folders default to
// expanded so the user lands on a complete map; the sidebar's
// per-session collapsed state is intentionally separate (state key
// `home-tree-expanded`) so collapsing in one place doesn't affect
// the other.

type FlatNote = { id: string, title: string, folder: string | null }

type TreeNode = {
  type: 'folder' | 'note'
  name: string
  fullPath: string
  noteId?: string
  children?: TreeNode[]
}

// Same useFetch key as the sidebar — Nuxt deduplicates so this is a
// shared SSR payload, no extra round-trip.
const { data: notes } = await useFetch<FlatNote[]>('/api/notes/tree')

const route = useRoute()
// Note IDs are UUIDs — match any non-slash chars after `/notes/`.
const activeNoteId = computed(() => {
  const m = route.path.match(/^\/notes\/([^/]+)/)
  return m && m[1] ? m[1] : null
})

const allFolderPaths = computed(() => {
  const paths = new Set<string>()
  for (const n of notes.value ?? []) {
    if (!n.folder) continue
    let cumulative = ''
    for (const part of n.folder.split('/').filter(Boolean)) {
      cumulative = cumulative ? `${cumulative}/${part}` : part
      paths.add(cumulative)
    }
  }
  return paths
})

// Default to fully expanded — the home page is the "map" view, so
// hiding folders by default would defeat the purpose. We initialize
// exactly once per session: the `initialized` flag survives SPA
// navigation (so coming back doesn't undo a "Collapse all" click)
// but resets on a full page reload (so a fresh session starts with
// everything visible again).
const expanded = useState<Set<string>>('home-tree-expanded', () => new Set())
const initialized = useState('home-tree-initialized', () => false)
onMounted(() => {
  if (!initialized.value && allFolderPaths.value.size > 0) {
    expanded.value = new Set(allFolderPaths.value)
    initialized.value = true
  }
})

function toggleFolder(path: string) {
  const next = new Set(expanded.value)
  next.has(path) ? next.delete(path) : next.add(path)
  expanded.value = next
}

function toggleExpandAll() {
  expanded.value = expanded.value.size === 0
    ? new Set(allFolderPaths.value)
    : new Set()
}

const tree = computed<TreeNode[]>(() => {
  const root: TreeNode = { type: 'folder', name: '', fullPath: '', children: [] }
  for (const n of notes.value ?? []) {
    const parts = n.folder ? n.folder.split('/').filter(Boolean) : []
    let parent = root
    let cumulative = ''
    for (const part of parts) {
      cumulative = cumulative ? `${cumulative}/${part}` : part
      let folder = parent.children!.find(c => c.type === 'folder' && c.name === part)
      if (!folder) {
        folder = { type: 'folder', name: part, fullPath: cumulative, children: [] }
        parent.children!.push(folder)
      }
      parent = folder
    }
    parent.children!.push({
      type: 'note',
      name: n.title,
      fullPath: n.folder ? `${n.folder}/${n.title}` : n.title,
      noteId: n.id
    })
  }
  const sortRecursive = (node: TreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortRecursive)
  }
  sortRecursive(root)
  return root.children ?? []
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
          v-if="allFolderPaths.size > 0"
          :icon="expanded.size === 0 ? 'i-lucide-chevrons-up-down' : 'i-lucide-chevrons-down-up'"
          variant="ghost"
          color="neutral"
          size="xs"
          class="ml-auto"
          :label="expanded.size === 0 ? 'Expand all' : 'Collapse all'"
          @click="toggleExpandAll"
        />
      </div>

      <!-- The recursive node component is the same as the sidebar.
           The wrapper picks up larger text via Tailwind so rows feel
           appropriately scaled for the main content area. -->
      <div v-if="tree.length" class="text-base [&_.text-sm]:text-base [&_.size-4]:size-5 [&_.size-3\.5]:size-4">
        <SidebarTreeNode
          v-for="node in tree"
          :key="node.fullPath"
          :node="node"
          :depth="0"
          :expanded="expanded"
          :active-note-id="activeNoteId"
          @toggle="toggleFolder"
        />
      </div>

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
