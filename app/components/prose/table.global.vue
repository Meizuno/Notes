<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

// Markdown can produce tables with any column count, so we count the
// first row's cells once on mount and stash it as a CSS custom prop
// (`--prose-cols`) for the grid layout to consume. No re-measure
// later — markdown tables don't reshape after rendering.
const gridEl = ref<HTMLDivElement | null>(null)

onMounted(async () => {
  await nextTick()
  if (!gridEl.value) return
  const firstRow = gridEl.value.querySelector('tr')
  if (!firstRow) return
  gridEl.value.style.setProperty('--prose-cols', String(firstRow.children.length))
})
</script>

<template>
  <div class="my-2 overflow-x-auto rounded-lg border border-default max-w-full min-w-0">
    <!-- No <table> element. MDC still emits <thead>/<tbody>/<tr>
         around the cells; CSS below collapses them via
         `display: contents` so cells become direct grid items. -->
    <div ref="gridEl" role="table" class="prose-grid-table text-sm">
      <slot />
    </div>
  </div>
</template>

<!--
  Why a grid instead of a real <table>:
    - Native <table>'s sizing algorithm + the parent .kb-fold-block
      grid track + Tailwind's class-purging in production combined
      to make the wrapper unreliable; we couldn't get both "fill the
      container on desktop" and "scroll on mobile" to hold across
      every build.
    - With `display: grid`, the layout is mechanical:
        grid-template-columns: repeat(N, minmax(min-content, 1fr))
      → columns share equally when the wrapper has room, and clamp
        to each column's min-content (longest unbreakable word for a
        wrap cell, full cell width for a nowrap cell) when it doesn't.
      → That clamp is what triggers the wrapper's overflow-x-auto on
        mobile (cells are `whitespace-nowrap` below `md`).

  Why `display: contents` on thead/tbody/tr:
    - The grid needs th/td as direct children to lay them out as
      grid items. `display: contents` removes the intermediate
      elements from layout while keeping them in the DOM (so
      :nth-child selectors still match for zebra striping etc.).
-->
<style>
.prose-grid-table {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(var(--prose-cols, 1), minmax(min-content, 1fr));
}
.prose-grid-table thead,
.prose-grid-table tbody,
.prose-grid-table tr {
  display: contents;
}
.prose-grid-table > tbody > tr:nth-child(even) > * {
  background: rgba(76, 86, 106, 0.06);     /* nord-3 / 6%  — light */
}
.dark .prose-grid-table > tbody > tr:nth-child(even) > * {
  background: rgba(76, 86, 106, 0.12);     /* nord-3 / 12% — dark */
}
</style>
