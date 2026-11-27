<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import NoteContent from "../components/NoteContent.vue";
import NoteForm from "../components/NoteForm.vue";
import { useAuth } from "../composables/useAuth";
import { useNoteEditor } from "../composables/useNoteEditor";
import { api } from "../lib/api";
import { withBase } from "../lib/base";
import { setHead, siteOrigin } from "../lib/head";
import type { Note } from "../lib/types";

const route = useRoute();
// The page is keyed on its path (App.vue), so a different note is a fresh
// instance and the key can be read once.
const id = String(route.params.id);
const { loggedIn } = useAuth();

// Fetched once: drives the head AND the rendered body (NoteContent parses
// `content`). A 404 (private / not visible / missing) leaves noteMeta null →
// the not-found message.
const noteMeta = ref<Note | null>(null);
const loaded = ref(false);
const siteUrl = siteOrigin();

function applyHead(note: Note | null) {
  if (!note) {
    setHead({ title: "Notes" });
    return;
  }
  const isPublic = note.visibility === "PUBLIC";
  // Canonical always uses the friendly slug, even when reached via the UUID
  // URL, so the two URLs dedupe to one for search engines.
  const canonical = siteUrl ? `${siteUrl}/${note.slug}` : undefined;
  setHead({
    title: note.title,
    description: note.description,
    ogTitle: note.title,
    ogDescription: note.description,
    ogType: "article",
    ogUrl: canonical,
    // PROTECTED / PRIVATE notes get noindex so they stay out of search even if
    // a bot somehow reaches the URL.
    robots: isPublic ? "index, follow" : "noindex, nofollow",
    canonical,
  });
}

api
  .getNote(id)
  .then((note) => {
    noteMeta.value = note;
  })
  .catch(() => {
    noteMeta.value = null;
  })
  .finally(() => {
    loaded.value = true;
    applyHead(noteMeta.value);
  });

// Edit-mode state + flows live in the composable; the page binds them.
const {
  editing,
  title,
  folder,
  description,
  content,
  visibility,
  isShared,
  saving,
  loadingEdit,
  startEdit,
  saveEdit,
  deleteNote,
} = useNoteEditor(id);

// saveEdit returns the saved note; adopt it so the view (content, updated_at →
// NoteContent remount, is_shared → copy-link) refreshes synchronously, no
// extra round-trip.
async function onSave() {
  const updated = await saveEdit();
  if (updated) {
    noteMeta.value = updated;
    applyHead(updated);
  }
}

// A note is shareable-by-link when it's PUBLIC or explicitly shared — only then
// does its URL work for others, so only then do we offer copy-link.
const shareable = computed(
  () => !!noteMeta.value && (noteMeta.value.is_shared || noteMeta.value.visibility === "PUBLIC"),
);

const toast = useToast();
async function copyLink() {
  const base = siteUrl || window.location.origin;
  try {
    await navigator.clipboard.writeText(`${base}${withBase(`/${noteMeta.value?.slug ?? id}`)}`);
    toast.add({ title: "Link copied", icon: "i-lucide-check", color: "success" });
  } catch {
    toast.add({ title: "Copy failed", description: "Clipboard unavailable", color: "error" });
  }
}

const formattedDate = computed(() =>
  noteMeta.value
    ? new Date(noteMeta.value.updated_at).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })
    : "",
);

// The folder path as a breadcrumb over the title.
const crumbs = computed(() => noteMeta.value?.folder?.split("/").filter(Boolean) ?? []);

// Who can read it, said under the title — the same three tiers the editor
// offers, in its words.
const VISIBILITY = {
  PRIVATE: { label: "Private", icon: "i-lucide-lock", color: "neutral" },
  PROTECTED: { label: "Protected", icon: "i-lucide-users", color: "neutral" },
  PUBLIC: { label: "Public", icon: "i-lucide-globe", color: "primary" },
} as const;
const tier = computed(() => (noteMeta.value ? VISIBILITY[noteMeta.value.visibility] : null));
</script>

<template>
  <!-- Reading is a column; the editor takes the width, for its preview. -->
  <div :class="editing ? '' : 'mx-auto max-w-3xl'">
    <!-- Edit mode -->
    <NoteForm
      v-if="editing"
      v-model:title="title"
      v-model:folder="folder"
      v-model:description="description"
      v-model:content="content"
      v-model:visibility="visibility"
      v-model:shared="isShared"
      :saving="saving"
      submit-label="Save"
      @submit="onSave"
      @cancel="editing = false"
    />

    <!-- View mode -->
    <template v-else-if="loaded">
      <div v-if="!noteMeta" class="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
        <UIcon name="i-lucide-file-question" class="size-10 text-dimmed" />
        <p class="text-lg font-extrabold text-highlighted">Note not found.</p>
        <p class="max-w-xs text-sm text-muted">It may have been deleted, or it is not shared with you.</p>
        <UButton to="/" icon="i-lucide-arrow-left" label="Back to the graph" color="neutral" variant="soft" class="mt-2" />
      </div>

      <article v-else>
        <header class="mb-4 px-1 sm:mb-5">
          <nav
            v-if="crumbs.length"
            class="mb-1.5 flex flex-wrap items-center gap-1 text-sm font-bold text-muted"
            aria-label="Folder"
          >
            <UIcon name="i-lucide-folder" class="size-4 text-dimmed" />
            <template v-for="(part, i) in crumbs" :key="i">
              <UIcon v-if="i" name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
              <span>{{ part }}</span>
            </template>
          </nav>

          <div class="flex items-start gap-3">
            <h1 class="min-w-0 flex-1 text-2xl leading-tight font-black tracking-tight text-highlighted sm:text-[2rem]">
              {{ noteMeta.title }}
            </h1>
            <div class="flex shrink-0 gap-1 pt-0.5">
              <UButton
                v-if="shareable"
                icon="i-lucide-link"
                variant="soft"
                color="neutral"
                aria-label="Copy link"
                @click="copyLink"
              />
              <template v-if="loggedIn">
                <UButton
                  icon="i-lucide-pencil"
                  variant="soft"
                  color="neutral"
                  aria-label="Edit note"
                  :loading="loadingEdit"
                  @click="startEdit"
                />
                <UButton icon="i-lucide-trash-2" variant="soft" color="error" aria-label="Delete note" @click="deleteNote" />
              </template>
            </div>
          </div>

          <div class="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <UBadge
              v-if="tier"
              :icon="tier.icon"
              :label="tier.label"
              :color="tier.color"
              variant="soft"
              class="font-bold"
            />
            <UBadge
              v-if="noteMeta.is_shared && noteMeta.visibility !== 'PUBLIC'"
              icon="i-lucide-link"
              label="Shared link"
              color="neutral"
              variant="soft"
              class="font-bold"
            />
            <span>Updated {{ formattedDate }}</span>
          </div>

          <p v-if="noteMeta.description" class="mt-3 text-base leading-relaxed text-toned">
            {{ noteMeta.description }}
          </p>
        </header>

        <div class="surface px-5 pt-3 pb-6 sm:px-9 sm:pt-4 sm:pb-8">
          <NoteContent
            :id="id"
            :key="noteMeta.updated_at"
            :content="noteMeta.content"
            :updated-at="noteMeta.updated_at"
            :title="noteMeta.title"
          />
        </div>
      </article>
    </template>

    <div v-else class="grid place-items-center py-24" aria-busy="true">
      <span class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  </div>
</template>
