<script setup lang="ts">
// Home page = the vault overview. Two presentations of the same data:
//   - Graph: force-directed network of notes + wiki-link edges
//   - Tree:  hierarchical folder layout, full-page version of the
//            sidebar tree
// Persisted as `?view=graph|tree` in the URL — shareable, survives
// reloads, plays well with browser back/forward. Defaults to graph
// when the param is missing or invalid.

useSeoMeta({ title: 'Knowledge Base' })

type View = 'graph' | 'tree'

const route = useRoute()
const router = useRouter()

const view = computed<View>({
  get() {
    return route.query.view === 'tree' ? 'tree' : 'graph'
  },
  set(val) {
    // `replace` instead of `push` so toggling doesn't pile up
    // history entries the user has to back through.
    router.replace({ query: { ...route.query, view: val } })
  }
})

const items = [
  { label: 'Graph', value: 'graph', icon: 'i-lucide-network' },
  { label: 'Tree', value: 'tree', icon: 'i-lucide-folder-tree' }
] as const
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-end px-2 py-1.5 shrink-0">
      <UTabs
        v-model="view"
        :items="items"
        :content="false"
        size="sm"
        variant="pill"
      />
    </div>

    <div class="flex-1 min-h-0">
      <HomeGraphView v-if="view === 'graph'" />
      <HomeTreeView v-else />
    </div>
  </div>
</template>
