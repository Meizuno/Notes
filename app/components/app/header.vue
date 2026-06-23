<script setup lang="ts">
// Top header strip — visible at every breakpoint. Brand on the left
// links to the home view; the right side carries the global "new
// note" action and the user dropdown for signed-in viewers.
// Anonymous viewers see no "Log in" affordance — the route is
// reachable directly at /login by anyone who knows it.

const { user, loggedIn, logout } = useAuth()

// Toggles the navigation sidebar's off-canvas drawer on small screens
// (the sidebar is always visible on large, so the button is lg:hidden).
const { toggle: toggleSidebar } = useSidebar()

// The right cluster carries the signed-in actions. Empty for anonymous
// viewers (the brand + menu button still hold the left).
const hasRightItems = computed(() => loggedIn.value)

const userMenuItems = computed(() => [
  [{
    label: user.value?.name ?? '',
    avatar: { src: user.value?.picture ?? undefined, alt: user.value?.name ?? undefined },
    disabled: true
  }],
  [{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    color: 'error' as const,
    onSelect: logout
  }]
])
</script>

<template>
  <header class="bg-default dark:bg-[#3D4452] border-b border-default shrink-0">
    <!-- Full-width row: brand always hugs the left; the right cluster
         (signed-in actions) hugs the right when present, or the brand
         simply sits alone on the left for anonymous viewers. `min-h`
         keeps the bar the same height whether or not the (taller)
         action buttons are present. -->
    <div class="flex items-center justify-between gap-2 px-4 py-1.5 min-h-11">
      <div class="flex items-center gap-1.5 min-w-0">
        <!-- Menu button: opens the nav drawer on small screens only. -->
        <UButton
          class="lg:hidden hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 transition-colors"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Toggle navigation"
          @click="toggleSidebar"
        />
        <NuxtLink
          to="/"
          class="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          <img src="/favicon.svg" class="w-5 h-5 shrink-0" alt="logo">
          <span class="font-semibold text-sm truncate">Notes</span>
        </NuxtLink>
      </div>

      <div v-if="hasRightItems" class="flex items-center gap-2">
        <UButton
          v-if="loggedIn"
          to="/new"
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="sm"
          label="New"
          class="hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary transition-colors"
        />

        <UDropdownMenu v-if="loggedIn" :items="userMenuItems" :ui="{ content: 'w-52' }">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            class="gap-1.5 px-1.5 hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
          >
            <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="2xs" />
            <UIcon name="i-lucide-chevron-down" class="size-3 text-muted" />
          </UButton>
        </UDropdownMenu>
      </div>
    </div>
  </header>
</template>
