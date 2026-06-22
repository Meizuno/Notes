<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  htmlAttrs: { lang: 'en' }
})

// Site-wide SEO defaults. The og:image is set here (once) so every page —
// home and notes — has a social-share thumbnail without repeating it;
// pages still override title/description/og:type per route. og:image needs
// an absolute URL, so it's gated on the configured site URL (prod). The
// image is public/og-image.png — a screenshot of the vault graph.
const config = useRuntimeConfig()
const siteUrl = String(config.public.siteUrl || '').replace(/\/$/, '')
useSeoMeta({
  title: 'Notes',
  ...(siteUrl
    ? {
        ogImage: `${siteUrl}/og-image.png`,
        ogImageType: 'image/png',
        ogImageWidth: 1277,
        ogImageHeight: 1157,
        ogImageAlt: 'The Notes vault, visualized as a force-directed graph',
        twitterCard: 'summary_large_image' as const
      }
    : {})
})

const route = useRoute()
const showShell = computed(() => route.path !== '/login')

// Hydrate the shared auth state once at the app root. SSR-fetched so
// the user dropdown paints correctly on first byte, no client-side
// flicker. Skipped on /login — user is unauthenticated by definition.
const { user } = useAuth()
if (route.path !== '/login') {
  const { data } = await useFetch<{ user: AuthUser }>('/api/auth/me')
  user.value = data.value?.user ?? null
}
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <div v-if="showShell" class="flex flex-col h-dvh w-full overflow-hidden">
      <AppHeader />
      <!-- `relative` anchors the small-screen sidebar drawer + backdrop to
           the content row (below the header), not the whole viewport. -->
      <div class="relative flex flex-1 min-h-0">
        <AppSidebar />
        <main class="flex-1 min-w-0 overflow-auto">
          <NuxtPage />
        </main>
      </div>
      <AppFooter />
    </div>
    <NuxtPage v-else />
    <ConfirmDialog />
  </UApp>
</template>
