<script setup lang="ts">
// Tells a screen reader that the page changed — Nuxt's <NuxtRouteAnnouncer>.
// A single-page app swaps content without a page load, so nothing else would:
// after each navigation the new page's title is read out.
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";

const message = ref("");
const router = useRouter();

const stop = router.afterEach((to, from) => {
  if (to.path === from.path) return;
  // After the page has rendered and set its own title.
  void nextTick(() => {
    setTimeout(() => {
      message.value = document.title;
    }, 0);
  });
});

onBeforeUnmount(stop);
</script>

<template>
  <span class="sr-only" role="alert" aria-live="polite" aria-atomic="true">{{ message }}</span>
</template>
