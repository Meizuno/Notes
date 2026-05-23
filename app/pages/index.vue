<script setup lang="ts">
// Home page = the vault overview. Two presentations of the same data:
//   - Graph: force-directed view of notes clustered around their
//            folder anchors
//   - Tree:  hierarchical folder layout, full-page version of the
//            sidebar tree
// Persisted as `?view=graph|tree` in the URL — shareable, survives
// reloads, plays well with browser back/forward. Defaults to graph
// when the param is missing or invalid.

const config = useRuntimeConfig()
const siteUrl = String(config.public.siteUrl || '').replace(/\/$/, '')
useSeoMeta({
  title: 'Notes',
  description: 'A self-hosted notes vault — browse a force-directed graph or a folder tree of every public note.',
  ogTitle: 'Notes',
  ogDescription: 'A self-hosted notes vault.',
  ogType: 'website',
  ogUrl: siteUrl || undefined,
  robots: 'index, follow'
})
if (siteUrl) {
  useHead({ link: [{ rel: 'canonical', href: `${siteUrl}/` }] })
}

type View = 'graph' | 'tree'

const route = useRoute()
const router = useRouter()

const view = computed<View>({
  get() {
    return route.query.view === 'tree' ? 'tree' : 'graph'
  },
  set(val: View) {
    // `replace` instead of `push` so toggling doesn't pile up
    // history entries the user has to back through.
    router.replace({ query: { ...route.query, view: val } })
  }
})

const items = [
  { label: 'Graph', value: 'graph', icon: 'i-lucide-network' },
  { label: 'Tree', value: 'tree', icon: 'i-lucide-folder-tree' }
] as const

// Prefetch the note tree alongside the graph so toggling to the
// Tree view is instant. The tree component reuses this payload via
// the shared `sidebar-tree` cache key — no second round-trip when
// it mounts.
await useFetch('/api/notes/tree', { key: 'sidebar-tree' })
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-2 py-1.5 shrink-0">
      <div class="flex items-center justify-end max-w-3xl mx-auto">
        <UTabs
          v-model="view"
          :items="items"
          :content="false"
          size="sm"
          variant="pill"
        />
      </div>
    </div>

    <div class="flex-1 min-h-0">
      <HomeGraphView v-if="view === 'graph'" />
      <HomeTreeView v-else />
    </div>
  </div>
</template>
