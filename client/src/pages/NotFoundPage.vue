<script setup lang="ts">
// A path that is no page of this app (two segments deep, say). The Nuxt app
// answered these with its stock error page; this keeps the shell around the
// message so the way home is still there.
import { setHead } from "../lib/head";

setHead({ title: "Page not found", robots: "noindex, nofollow" });
</script>

<template>
  <div class="surface mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
    <p class="text-6xl font-black tracking-tight text-highlighted">404</p>
    <p class="text-lg font-extrabold text-highlighted">Page not found</p>
    <UButton to="/" icon="i-lucide-arrow-left" label="Back to the graph" color="neutral" variant="soft" class="mt-2" />
  </div>
</template>
