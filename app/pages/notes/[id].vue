<script setup lang="ts">
import type { Note } from '#shared/schemas/note'

const route = useRoute()
const id = String(route.params.id)
const { loggedIn } = useAuth()

// SSR-fetch the note so Google sees real title/description in the
// head. The body still streams via <NoteStream> for the progressive
// rendering UX; this extra fetch is meta-only and discarded after
// `useSeoMeta` consumes it. 404 (private / not visible / missing)
// falls through to NoteStream's own not-found state.
const config = useRuntimeConfig()
const siteUrl = String(config.public.siteUrl || '').replace(/\/$/, '')
const { data: noteMeta } = await useFetch<Note>(`/api/notes/${id}`, {
  key: `note-meta-${id}`
})

if (noteMeta.value) {
  const isPublic = noteMeta.value.visibility === 'PUBLIC'
  const canonical = siteUrl ? `${siteUrl}/notes/${id}` : undefined
  useSeoMeta({
    title: noteMeta.value.title,
    description: noteMeta.value.description ?? undefined,
    ogTitle: noteMeta.value.title,
    ogDescription: noteMeta.value.description ?? undefined,
    ogType: 'article',
    ogUrl: canonical,
    // PROTECTED / PRIVATE notes get noindex so they stay out of
    // Google even if a bot somehow reaches the URL.
    robots: isPublic ? 'index, follow' : 'noindex, nofollow'
  })
  if (canonical) {
    useHead({ link: [{ rel: 'canonical', href: canonical }] })
  }
}

// All edit-mode state + the load/save/delete flows live in the
// composable; the page just binds them. `version` keys <NoteStream>
// so it remounts and re-fetches after a save.
const {
  editing,
  editTitle,
  editFolder,
  editDescription,
  editContent,
  editVisibility,
  saving,
  loadingEdit,
  version,
  startEdit,
  saveEdit,
  deleteNote
} = useNoteEditor(id)
</script>

<template>
  <div class="max-w-3xl mx-auto px-4" :class="editing ? 'pt-4 pb-2 h-full overflow-hidden' : 'pb-4'">
    <!-- Edit mode -->
    <template v-if="editing">
      <NoteForm
        v-model:title="editTitle"
        v-model:folder="editFolder"
        v-model:description="editDescription"
        v-model:content="editContent"
        v-model:visibility="editVisibility"
        :saving="saving"
        submit-label="Save"
        @submit="saveEdit"
        @cancel="editing = false"
      />
    </template>

    <!-- View mode -->
    <template v-else>
      <!-- Everything (metadata + body) streams from
           /api/notes/<id>/stream so navigation is instant and the
           page paints progressively as bytes arrive. The actions
           slot puts Edit/Delete inline with the title row. -->
      <NoteStream :id="id" :key="version">
        <template v-if="loggedIn" #actions>
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            color="neutral"
            size="sm"
            :loading="loadingEdit"
            @click="startEdit"
          />
          <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" @click="deleteNote" />
        </template>
      </NoteStream>
    </template>
  </div>
</template>
