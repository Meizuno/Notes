<script setup lang="ts">
// Recursive row in the sidebar tree. Folder rows expand/collapse on
// click; note rows navigate. `active-note-id` highlights the row that
// matches the current route.

type TreeNode = {
  type: 'folder' | 'note'
  name: string
  fullPath: string
  noteId?: string
  children?: TreeNode[]
}

const props = defineProps<{
  node: TreeNode
  depth: number
  expanded: Set<string>
  activeNoteId: string | null
}>()

const emit = defineEmits<{ toggle: [path: string] }>()

const isExpanded = computed(() => props.expanded.has(props.node.fullPath))
const isActive = computed(() => props.node.type === 'note' && props.node.noteId === props.activeNoteId)
const indentPx = computed(() => 8 + props.depth * 12)
</script>

<template>
  <div>
    <!-- Folder row -->
    <button
      v-if="node.type === 'folder'"
      type="button"
      class="flex items-center gap-1 w-full py-1 pr-2 text-left hover:bg-elevated transition-colors text-muted hover:text-default"
      :style="{ paddingLeft: `${indentPx}px` }"
      @click="emit('toggle', node.fullPath)"
    >
      <UIcon
        :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-3.5 shrink-0"
      />
      <UIcon
        :name="isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder'"
        class="size-4 shrink-0"
      />
      <span class="truncate text-sm">{{ node.name }}</span>
    </button>

    <!-- Note row -->
    <NuxtLink
      v-else
      :to="`/notes/${node.noteId}`"
      class="flex items-center gap-1 w-full py-1 pr-2 transition-colors"
      :class="isActive
        ? 'bg-primary/10 text-primary'
        : 'text-default/85 hover:bg-elevated hover:text-default'"
      :style="{ paddingLeft: `${indentPx + 16}px` }"
    >
      <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-muted" />
      <span class="truncate text-sm">{{ node.name }}</span>
    </NuxtLink>

    <!-- Children -->
    <div v-if="node.type === 'folder' && isExpanded && node.children?.length">
      <SidebarTreeNode
        v-for="child in node.children"
        :key="child.fullPath"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :active-note-id="activeNoteId"
        @toggle="(p) => emit('toggle', p)"
      />
    </div>
  </div>
</template>
