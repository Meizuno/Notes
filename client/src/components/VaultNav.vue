<script setup lang="ts">
// The navigation card: a search box over the folder tree, and the credit line
// at its foot. While there is a query the tree gives way to what it found —
// title, folder and the snippet around the match, the matched words marked.
// Drawn in the sticky aside on large screens and in the slide-over on small.
import { computed, nextTick, useTemplateRef, watch } from "vue";
import { RouterLink } from "vue-router";

import { useSearch } from "../composables/useSearch";
import { useVault } from "../composables/useVault";
import { markMatches, plainSnippet } from "../lib/search-marks";
import AppFooter from "./AppFooter.vue";
import HomeTreeView from "./HomeTreeView.vue";

const { query, results, total, searching, clear, focusTick } = useSearch();
const { tree } = useVault();

// The list carries no slug; the tree knows every readable note's, so a result
// links to its friendly URL (the UUID one works too, as a fallback).
const slugs = computed(() => new Map((tree.value ?? []).map((n) => [n.id, n.slug])));
const hrefOf = (id: string) => `/${slugs.value.get(id) ?? id}`;

const searchingFor = computed(() => query.value.trim());
const summary = computed(() => {
  if (searching.value) return "Searching…";
  return `${total.value} ${total.value === 1 ? "note" : "notes"}`;
});

const input = useTemplateRef<{ inputRef?: HTMLInputElement | null }>("input");
watch(focusTick, () => void nextTick(() => input.value?.inputRef?.focus()));

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  clear();
  (e.target as HTMLElement | null)?.blur();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 px-3 pt-3 pb-2">
      <UInput
        ref="input"
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search notes"
        aria-label="Search notes"
        variant="soft"
        size="lg"
        class="w-full"
        @keydown="onKeydown"
      >
        <template #trailing>
          <UButton
            v-if="query"
            icon="i-lucide-x"
            size="xs"
            variant="link"
            color="neutral"
            aria-label="Clear search"
            @click="clear"
          />
          <UKbd v-else value="/" class="hidden lg:inline-flex" />
        </template>
      </UInput>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <template v-if="searchingFor">
        <p class="px-2.5 pb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted" aria-live="polite">
          {{ summary }}
        </p>
        <ul v-if="results.length" class="space-y-0.5">
          <li v-for="r in results" :key="r.id">
            <RouterLink
              :to="hrefOf(r.id)"
              class="block rounded-xl px-2.5 py-2 outline-none transition-colors hover:bg-elevated focus-visible:bg-elevated"
              active-class="bg-primary/10"
            >
              <p class="truncate text-sm font-bold text-highlighted">
                <template v-for="(run, i) in markMatches(r.title, searchingFor)" :key="i">
                  <mark v-if="run.hit" class="rounded-sm bg-primary/15 text-inherit">{{ run.text }}</mark>
                  <template v-else>{{ run.text }}</template>
                </template>
              </p>
              <p v-if="r.folder" class="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                <UIcon name="i-lucide-folder" class="size-3 shrink-0" />
                {{ r.folder }}
              </p>
              <p v-if="r.snippet" class="mt-1 line-clamp-2 text-xs leading-relaxed text-toned">
                <template v-for="(run, i) in markMatches(plainSnippet(r.snippet), searchingFor)" :key="i">
                  <mark v-if="run.hit" class="rounded-sm bg-primary/15 font-bold text-inherit">{{
                    run.text
                  }}</mark>
                  <template v-else>{{ run.text }}</template>
                </template>
              </p>
            </RouterLink>
          </li>
        </ul>
        <div v-else-if="!searching" class="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <UIcon name="i-lucide-search-x" class="size-8 text-dimmed" />
          <p class="text-sm text-muted">Nothing matches “{{ searchingFor }}”.</p>
        </div>
      </template>
      <HomeTreeView v-else />
    </div>

    <div class="shrink-0 border-t border-default/60 px-4 py-3">
      <AppFooter />
    </div>
  </div>
</template>
