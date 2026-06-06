<!--
  Custom <pre> wrapper with a copy button. MDC passes the raw block text
  as the `code` prop (the slot is the highlighted markup), so the button
  copies `code` directly rather than scraping textContent.

  NO whitespace between the opening <pre> tag and <slot />: <pre> preserves
  whitespace, so a newline + template indentation would render as literal
  characters before the first highlighted token. Keep the slot interpolation
  glued to the opening tag.

  Sizing notes:
    - `max-w-full` + `min-w-0` keep the block from expanding its parent on a
      narrow viewport. Without min-w-0, a flex / grid ancestor lets the pre
      push the layout sideways and the whole page scrolls horizontally.
    - `overflow-x-auto` makes the block itself scroll on mobile;
      `whitespace-pre` is explicit so a future global style can't accidentally
      enable wrapping inside code.
    - Padding grows from `p-2` to `p-3` above sm to reclaim phone width.
-->
<script setup lang="ts">
// Props MDC supplies to ProsePre. We only use `code` (raw block text); the
// rest are declared so they aren't forwarded onto the <pre> as attributes.
const props = defineProps<{
  code?: string
  language?: string | null
  filename?: string | null
  highlights?: number[]
  meta?: string | null
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code ?? '')
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 1500)
  }
  catch { /* clipboard unavailable (insecure context / denied) — no-op */ }
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="relative my-2 max-w-full min-w-0">
    <!-- Always visible (no hover gate). Icons are inlined SVG (lucide
         copy / check) so they render without depending on the icon
         client-bundle, matching the inline-SVG approach used elsewhere. -->
    <button
      type="button"
      class="absolute right-1.5 top-1.5 z-10 inline-flex items-center justify-center rounded-md border border-default bg-default p-1 text-muted"
      :aria-label="copied ? 'Copied' : 'Copy code'"
      :title="copied ? 'Copied' : 'Copy code'"
      @click="copyCode"
    >
      <svg v-if="copied" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
    </button>
    <pre class="p-2 sm:p-3 text-sm rounded-lg border border-default bg-muted overflow-x-auto max-w-full min-w-0 whitespace-pre"><slot /></pre>
  </div>
</template>
