<script setup lang="ts">
// A path that is no page of this app (two segments deep, say). The Nuxt app
// answered these with its stock error page; this keeps the shell around the
// message so the way home is still there.
import { setHead } from "../lib/head";

setHead({ title: "Page not found", robots: "noindex, nofollow" });
</script>

<template>
  <div class="grid h-full place-items-center px-4">
    <div class="flex flex-col items-center gap-3 text-center">
      <p class="text-5xl font-bold text-highlighted">404</p>
      <p class="text-sm text-muted">Page not found</p>
      <UButton to="/" icon="i-lucide-arrow-left" label="Go back home" size="sm" color="primary" variant="soft" />
    </div>
  </div>
</template>
