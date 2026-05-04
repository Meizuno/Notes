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
// the sidebar dropdown paints correctly on first byte, no client-side
// flicker. Skipped on /login — user is unauthenticated by definition.
const { user } = useAuth()
if (route.path !== '/login') {
  const { data } = await useFetch<{ user: AuthUser }>('/api/auth/me')
  user.value = data.value?.user ?? null
}

// Sidebar drawer state. Only matters below the `lg` breakpoint — at
// lg+ the sidebar is always visible because the CSS classes override
// the transform. We close it on every route change so tapping a note
// dismisses the drawer on mobile; on desktop, closing is a no-op.
const sidebarOpen = useState('sidebar-open', () => false)
watch(() => route.fullPath, () => { sidebarOpen.value = false })
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <div v-if="showShell" class="flex h-dvh w-full overflow-hidden">
      <!-- Backdrop dims main content when the drawer is open. -->
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-30 bg-black/40 lg:hidden"
        @click="sidebarOpen = false"
      />

      <!-- On mobile the sidebar is an off-canvas drawer that slides
           in from the left; on lg+ it's part of the flex flow and
           always visible. -->
      <AppSidebar
        class="w-64 shrink-0 z-40 fixed inset-y-0 left-0 transition-transform duration-200 ease-out lg:relative lg:translate-x-0"
        :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      />

      <main class="flex-1 min-w-0 flex flex-col overflow-hidden">
        <!-- Mobile toolbar with the open button. Lives at the top of
             <main> in column flow (not sticky / not fixed) so the
             scroll area below it is bounded — pages can use `h-full`
             without overflowing. Hidden at lg+. -->
        <div class="lg:hidden flex items-center gap-2 px-2 py-1.5 bg-default border-b border-default shrink-0">
          <UButton
            icon="i-lucide-menu"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Open sidebar"
            @click="sidebarOpen = true"
          />
          <NuxtLink
            to="/"
            class="ml-auto flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span class="font-semibold text-sm">Knowledge Base</span>
            <img src="/favicon.svg" class="w-5 h-5" alt="logo">
          </NuxtLink>
        </div>
        <div class="flex-1 min-h-0 overflow-auto">
          <NuxtPage />
        </div>
      </main>
    </div>
    <NuxtPage v-else />
    <ConfirmDialog />
  </UApp>
</template>
