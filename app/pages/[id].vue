<script setup lang="ts">
import type { Note } from '#shared/schemas/note'

const route = useRoute()
const id = String(route.params.id)
const { loggedIn } = useAuth()

// SSR-fetch the note once: drives the SEO head AND the rendered body
// (NoteContent parses `content`). 404 (private / not visible / missing)
// leaves noteMeta null → the not-found message.
const config = useRuntimeConfig()
const siteUrl = String(config.public.siteUrl || '').replace(/\/$/, '')
const { data: noteMeta } = await useFetch<Note>(`/api/notes/${id}`, {
  key: `note-meta-${id}`
})

if (noteMeta.value) {
  const isPublic = noteMeta.value.visibility === 'PUBLIC'
  // Canonical always uses the friendly slug, even when reached via the
  // UUID URL, so the two URLs dedupe to one for search engines.
  const canonical = siteUrl ? `${siteUrl}/${noteMeta.value.slug}` : undefined
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
  deleteNote
} = useNoteEditor(id)

// saveEdit returns the saved note; adopt it so the view (content,
// updated_at → NoteContent remount, is_shared → copy-link) refreshes
// synchronously, no extra round-trip.
async function onSave() {
  const updated = await saveEdit()
  if (updated) noteMeta.value = updated
}

// A note is shareable-by-link when it's PUBLIC or explicitly shared — only
// then does its URL work for others, so only then do we offer copy-link.
const shareable = computed(() =>
  !!noteMeta.value && (noteMeta.value.is_shared || noteMeta.value.visibility === 'PUBLIC')
)

const toast = useToast()
async function copyLink() {
  const base = siteUrl || window.location.origin
  try {
    await navigator.clipboard.writeText(`${base}/${noteMeta.value?.slug ?? id}`)
    toast.add({ title: 'Link copied', icon: 'i-lucide-check', color: 'success' })
  }
  catch {
    toast.add({ title: 'Copy failed', description: 'Clipboard unavailable', color: 'error' })
  }
}

const formattedDate = computed(() =>
  noteMeta.value
    ? new Date(noteMeta.value.updated_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
)
</script>

<template>
  <div class="max-w-3xl mx-auto px-4" :class="editing ? 'pt-4 pb-2 h-full overflow-hidden' : 'pb-4'">
    <!-- Edit mode -->
    <template v-if="editing">
      <NoteForm
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
    </template>

    <!-- View mode -->
    <template v-else>
      <div v-if="!noteMeta" class="text-sm text-muted pt-6">Note not found.</div>
      <template v-else>
        <!-- Title row, sticky to the scroll container. Copy-link shows when
             the URL works for others (PUBLIC / shared); Edit/Delete are
             auth-gated. -->
        <div class="sticky top-0 z-10 bg-default -mx-4 px-4 py-3 mb-4 flex items-start justify-between gap-3 border-b border-default/60">
          <h1 class="text-2xl font-bold leading-tight min-w-0 flex-1">{{ noteMeta.title }}</h1>
          <div class="flex gap-1 shrink-0">
            <UButton
              v-if="shareable"
              icon="i-lucide-link"
              variant="ghost"
              color="neutral"
              size="sm"
              aria-label="Copy link"
              @click="copyLink"
            />
            <template v-if="loggedIn">
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
          </div>
        </div>

        <p v-if="noteMeta.folder" class="text-xs text-muted mb-1 flex items-center gap-1">
          <UIcon name="i-lucide-folder" class="size-3" />
          {{ noteMeta.folder }}
        </p>
        <p class="text-xs text-muted mb-6">Last updated: {{ formattedDate }}</p>

        <NoteContent
          :id="id"
          :key="noteMeta.updated_at"
          :content="noteMeta.content"
          :updated-at="noteMeta.updated_at"
        />
      </template>
    </template>
  </div>
</template>
