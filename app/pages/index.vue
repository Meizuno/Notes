<script setup lang="ts">
// Home page = the vault overview. The folder tree now lives in the app-wide
// navigation sidebar (AppSidebar), so the home page is just the
// force-directed graph filling the content area.

const config = useRuntimeConfig()
const siteUrl = String(config.public.siteUrl || '').replace(/\/$/, '')
useSeoMeta({
  title: 'Notes',
  description: 'A self-hosted notes vault — browse a force-directed graph or a folder tree of every public note.',
  ogTitle: 'Notes',
  ogDescription: 'A self-hosted notes vault.',
  ogType: 'website',
  ogUrl: siteUrl || undefined,
  robots: 'index, follow'
})
if (siteUrl) {
  useHead({ link: [{ rel: 'canonical', href: `${siteUrl}/` }] })
}
</script>

<template>
  <div class="h-full">
    <HomeGraphView />
  </div>
</template>
