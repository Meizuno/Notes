<script setup lang="ts">
// Internal links (resolved or dangling wiki-links rendered by the
// stream endpoint) use NuxtLink for SPA navigation. External URLs
// open in a new tab.
//
// "Dangling" links go to /notes/new?title=… — we detect that pattern
// and apply muted/italic styling so unresolved references look
// different from real cross-links, à la Obsidian.

const props = defineProps<{ href?: string }>()

const isInternal = computed(() => Boolean(props.href?.startsWith('/')))
const isDangling = computed(() => Boolean(props.href?.startsWith('/notes/new?')))
</script>

<template>
  <NuxtLink
    v-if="isInternal"
    :to="href"
    class="underline underline-offset-2"
    :class="isDangling
      ? 'text-muted/70 italic decoration-dashed hover:text-muted'
      : 'text-primary hover:text-primary/80'"
  >
    <slot />
  </NuxtLink>
  <a
    v-else
    class="text-orange-500 hover:text-orange-600 underline underline-offset-2"
    target="_blank"
    rel="noopener noreferrer"
    v-bind="$attrs"
  >
    <slot />
  </a>
</template>
