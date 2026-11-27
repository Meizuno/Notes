<script setup lang="ts">
// Home page = the vault overview. The folder tree lives in the app-wide
// navigation sidebar (AppSidebar), so the home page is just the force-directed
// graph filling the content area.
import { computed, onMounted } from "vue";

import HomeGraphView from "../components/HomeGraphView.vue";
import { useVault } from "../composables/useVault";
import { setHead, siteOrigin } from "../lib/head";

const { tree, loadTree } = useVault();
onMounted(() => void loadTree());

// What the graph holds, in a line under the title.
const summary = computed(() => {
  if (!tree.value) return "";
  const notes = tree.value.length;
  const folders = new Set(tree.value.flatMap((n) => (n.folder ? [n.folder.split("/")[0]] : []))).size;
  const noun = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return folders ? `${noun(notes, "note")} in ${noun(folders, "folder")}` : noun(notes, "note");
});

const siteUrl = siteOrigin();
setHead({
  title: "Notes",
  description: "A self-hosted notes vault — browse a force-directed graph or a folder tree of every public note.",
  ogTitle: "Notes",
  ogDescription: "A self-hosted notes vault.",
  ogType: "website",
  ogUrl: siteUrl || undefined,
  robots: "index, follow",
  canonical: siteUrl ? `${siteUrl}/` : undefined,
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
      <div class="min-w-0">
        <h1 class="text-2xl font-black tracking-tight text-highlighted sm:text-3xl">Graph</h1>
        <p class="mt-0.5 text-sm text-muted">
          {{ summary }}<span v-if="summary" class="hidden sm:inline"> · drag to pan, scroll to zoom, click a note</span>
        </p>
      </div>
    </div>
    <div class="surface relative h-[calc(100dvh-var(--app-header)-9.5rem)] min-h-[22rem] overflow-hidden">
      <HomeGraphView />
    </div>
  </section>
</template>
