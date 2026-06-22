<script setup lang="ts">
// App navigation sidebar — the vault folder tree, available on every page.
// Pinned visible on large screens (lg:static, always translated in); on
// small screens it's an off-canvas drawer toggled by the header menu button
// (useSidebar) and dismissed by the backdrop or by navigating. Positioned
// absolutely inside the shell's content row, so on small screens it overlays
// the page below the header rather than covering the whole viewport.
const { open, close } = useSidebar()
const route = useRoute()

// Navigating (e.g. tapping a note in the tree) closes the drawer on small
// screens; harmless on large where the sidebar stays put regardless.
watch(() => route.fullPath, () => close())
</script>

<template>
  <!-- Backdrop: small screens only, while the drawer is open. -->
  <div
    v-if="open"
    class="absolute inset-0 z-30 bg-black/40 lg:hidden"
    aria-hidden="true"
    @click="close"
  />

  <aside
    class="absolute lg:static inset-y-0 left-0 z-40 w-72 shrink-0 overflow-y-auto bg-default dark:bg-[#3D4452] border-r border-default transition-transform duration-200 lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <HomeTreeView />
  </aside>
</template>
