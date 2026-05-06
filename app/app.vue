<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({ title: 'Knowledge Base' })

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
      <main class="flex-1 min-h-0 overflow-auto">
        <NuxtPage />
      </main>
    </div>
    <NuxtPage v-else />
    <ConfirmDialog />
  </UApp>
</template>
