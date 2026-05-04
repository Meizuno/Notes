<script setup lang="ts">
// Sidebar with brand, action buttons, and a recursive folder tree of
// every note in the vault. Folders are derived from the `folder`
// column on Note (slash-separated paths); they aren't stored as rows.
//
// The tree expands on click; expansion state lives in a Set keyed on
// the folder path. The currently-viewed note is highlighted.

type FlatNote = { id: number, title: string, folder: string | null }

type TreeNode = {
  type: 'folder' | 'note'
  name: string
  fullPath: string
  noteId?: number
  children?: TreeNode[]
}

const route = useRoute()
const { user, loggedIn, logout } = useAuth()

// Same key as in app.vue — useState is process-shared, so toggling
// here flips the drawer. Only visible / actionable below `lg`.
const sidebarOpen = useState('sidebar-open', () => false)

const { data: notes, refresh } = await useFetch<FlatNote[]>('/api/notes/tree', {
  key: 'sidebar-tree'
})

// Re-fetch when navigating between notes so a new/edited/deleted note
// shows up in the tree without a manual reload.
watch(() => route.fullPath, () => { refresh() })

// Folders default to collapsed. The Set is per-session (useState) so
// expansion choices persist across SPA navigation; reload returns to
// the all-collapsed state.
const expanded = useState<Set<string>>('sidebar-expanded', () => new Set())

function toggleFolder(path: string) {
  const next = new Set(expanded.value)
  next.has(path) ? next.delete(path) : next.add(path)
  expanded.value = next
}

// Collect every folder path that appears in the current note set,
// including all parent prefixes. Used by `expandAll`.
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

function toggleExpandAll() {
  if (expanded.value.size === 0) {
    expanded.value = new Set(allFolderPaths.value)
  }
  else {
    expanded.value = new Set()
  }
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

  // Sort each level: folders before notes, alphabetical within each.
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

const userMenuItems = computed(() => [
  [{
    label: user.value?.name ?? '',
    avatar: { src: user.value?.picture ?? undefined, alt: user.value?.name ?? undefined },
    disabled: true
  }],
  [{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    color: 'error' as const,
    onSelect: logout
  }]
])

const activeNoteId = computed(() => {
  const m = route.path.match(/^\/notes\/(\d+)/)
  return m && m[1] ? Number(m[1]) : null
})
</script>

<template>
  <aside class="flex flex-col h-full border-r border-default bg-default/90 select-none">
    <!-- Brand row: app name + mobile close button -->
    <div class="flex items-center gap-2 pl-4 pr-2 py-2 border-b border-default">
      <NuxtLink
        to="/"
        class="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <img src="/favicon.svg" class="w-5 h-5" alt="logo">
        <span class="font-semibold text-sm truncate">Knowledge Base</span>
      </NuxtLink>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        class="lg:hidden shrink-0"
        aria-label="Close sidebar"
        @click="sidebarOpen = false"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1 px-3 py-2 border-b border-default">
      <UButton
        to="/notes/new"
        icon="i-lucide-plus"
        variant="ghost"
        color="neutral"
        size="xs"
        label="New"
        class="grow justify-start"
      />
      <UButton
        :icon="expanded.size === 0 ? 'i-lucide-chevrons-up-down' : 'i-lucide-chevrons-down-up'"
        variant="ghost"
        color="neutral"
        size="xs"
        :disabled="allFolderPaths.size === 0"
        :title="expanded.size === 0 ? 'Expand all folders' : 'Collapse all folders'"
        @click="toggleExpandAll"
      />
    </div>

    <!-- Tree -->
    <nav class="flex-1 overflow-y-auto py-1.5 text-sm">
      <SidebarTreeNode
        v-for="node in tree"
        :key="node.fullPath"
        :node="node"
        :depth="0"
        :expanded="expanded"
        :active-note-id="activeNoteId"
        @toggle="toggleFolder"
      />
      <p v-if="!notes?.length" class="text-xs text-muted text-center py-6">No notes yet.</p>
    </nav>

    <!-- User dropdown -->
    <div v-if="loggedIn" class="border-t border-default p-2">
      <UDropdownMenu :items="userMenuItems" :ui="{ content: 'w-52' }">
        <UButton variant="ghost" color="neutral" size="sm" class="w-full justify-start gap-2">
          <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="2xs" />
          <span class="text-xs font-medium truncate flex-1 text-left">{{ user?.name }}</span>
          <UIcon name="i-lucide-chevron-up" class="size-3 text-muted shrink-0" />
        </UButton>
      </UDropdownMenu>
    </div>
  </aside>
</template>
