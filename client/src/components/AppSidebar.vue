<script setup lang="ts">
// The navigation — search and the folder tree — on every page. On large
// screens a card that stays put beside the page (Forma's sticky aside); on
// small ones a slide-over from the left, opened from the header and closed by
// navigating.
import { watch } from "vue";
import { useRoute } from "vue-router";

import { useSidebar } from "../composables/useSidebar";
import BrandMark from "./BrandMark.vue";
import VaultNav from "./VaultNav.vue";

const { open, close } = useSidebar();
const route = useRoute();

watch(
  () => route.fullPath,
  () => close(),
);
</script>

<template>
  <aside class="hidden lg:sticky lg:top-[calc(var(--app-header)+1.5rem)] lg:block lg:self-start" aria-label="Notes">
    <div class="surface h-[calc(100dvh-var(--app-header)-3rem)] overflow-hidden">
      <VaultNav />
    </div>
  </aside>

  <USlideover
    v-model:open="open"
    side="left"
    title="Notes"
    description="Search and browse the vault"
    :ui="{
      content: 'max-w-[21rem] rounded-e-[1.75rem]',
      header: 'min-h-0 border-0 px-4 pt-4 pb-0 sm:px-4',
      description: 'sr-only',
      body: 'p-0 sm:p-0',
    }"
  >
    <template #title>
      <span class="flex items-center gap-2">
        <BrandMark class="size-6" />
        <span class="font-black tracking-tight text-highlighted">Notes</span>
      </span>
    </template>
    <template #body>
      <VaultNav />
    </template>
  </USlideover>
</template>
