<script setup lang="ts">
// All anchors from MDC's prose output route through here. Internal
// links (any href starting with `/`) use NuxtLink for SPA navigation;
// external URLs open in a new tab with the standard rel attrs.

const props = defineProps<{ href?: string }>()

const isInternal = computed(() => Boolean(props.href?.startsWith('/')))
</script>

<template>
  <NuxtLink
    v-if="isInternal"
    :to="href"
    class="text-primary hover:text-primary/80 underline underline-offset-2"
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
