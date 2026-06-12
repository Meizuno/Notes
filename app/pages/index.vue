<script setup lang="ts">
// Home page = the vault overview. Two presentations of the same data:
//   - Graph: force-directed view of notes clustered around their
//            folder anchors
//   - Tree:  hierarchical folder layout, full-page version of the
//            sidebar tree
// Persisted as `?view=graph|tree` in the URL — shareable, survives
// reloads, plays well with browser back/forward. Defaults to graph
// when the param is missing or invalid. The toggle itself lives in
// the header (see app/components/app/header.vue) so it stays
// consistent with the rest of the chrome; this page only reads the
// query to pick which view to mount.

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

const route = useRoute()
const view = computed(() => route.query.view === 'tree' ? 'tree' : 'graph')

// Prefetch the note tree alongside the graph so toggling to the
// Tree view is instant. The tree component reuses this payload via
// the shared `sidebar-tree` cache key — no second round-trip when
// it mounts.
await useFetch('/api/notes/tree', { key: 'sidebar-tree' })
</script>

<template>
  <!-- The outer flex column gives the graph/tree slot something to
       claim full height against — its inner `flex-1 min-h-0` is a
       no-op without a flex parent here, because `<main>` provides
       scroll, not a flex column. -->
  <div class="flex flex-col h-full">
    <div class="flex-1 min-h-0">
      <HomeGraphView v-if="view === 'graph'" />
      <HomeTreeView v-else />
    </div>
  </div>
</template>
