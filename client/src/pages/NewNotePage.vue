<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import NoteForm from "../components/NoteForm.vue";
import { useNoteForm } from "../composables/useNoteForm";
import { useVault } from "../composables/useVault";
import { api } from "../lib/api";
import { setHead } from "../lib/head";

const route = useRoute();
const router = useRouter();
const { refreshVault } = useVault();
const { title, folder, description, content, visibility, isShared, toCreateInput } = useNoteForm();

setHead({ title: "Notes" });

// Pre-fill from query params:
//   ?title=Foo  — entry point for "create note with this title".
//   ?folder=A/B — "new note in this folder" entry points.
title.value = String(route.query.title ?? "");
folder.value = String(route.query.folder ?? "");

const saving = ref(false);

async function save() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  try {
    const note = await api.createNote(toCreateInput());
    // Surface the new note in the cached sidebar tree + home graph.
    await refreshVault();
    await router.push(`/${note.slug}`);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 pt-4 pb-2 h-full overflow-hidden">
    <NoteForm
      v-model:title="title"
      v-model:folder="folder"
      v-model:description="description"
      v-model:content="content"
      v-model:visibility="visibility"
      v-model:shared="isShared"
      :saving="saving"
      submit-label="Save note"
      @submit="save"
      @cancel="router.push('/')"
    />
  </div>
</template>
