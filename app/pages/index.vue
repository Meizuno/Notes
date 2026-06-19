<script setup lang="ts">
// Home page = the vault overview. Responsive layout, done purely with CSS
// (Tailwind `lg:` utilities) so the right layout is chosen on the first
// paint — no matchMedia, no post-hydration swap/flash on desktop:
//   - Large (≥ lg): graph fills the main area with the tree pinned as a
//     left sidebar — both visible, Obsidian-style.
//   - Small: tree only. The force-graph wants pan/zoom/space that doesn't
//     suit a phone; the tree is a tappable, crawler-friendly folder list.
//
// CSS hides, it can't unmount, so the graph stays mounted on small screens
// — but it sits at zero size there and its simulation bails until shown
// (see HomeGraphView's startSim/measure guard), so it costs nothing.

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

// Prefetch the note tree so the sidebar / tree view paints without a
// second round-trip when it mounts.
await useFetch('/api/notes/tree', { key: 'sidebar-tree' })
</script>

<template>
  <div class="flex h-full">
    <!-- ≥ lg: tree pinned as a left sidebar + graph filling the rest. -->
    <aside class="hidden lg:block w-80 shrink-0 border-r border-default overflow-hidden">
      <HomeTreeView />
    </aside>
    <div class="hidden lg:block flex-1 min-w-0">
      <HomeGraphView />
    </div>

    <!-- < lg: tree only. -->
    <div class="lg:hidden flex-1 min-w-0">
      <HomeTreeView />
    </div>
  </div>
</template>
