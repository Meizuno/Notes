<script setup lang="ts">
// Top header strip — visible at every breakpoint. Brand on the left
// links to the home view (graph / tree); the right side carries the
// global "new note" action and the user dropdown. The vault tree
// itself lives on the home page now (no separate sidebar).

const { user, loggedIn, logout } = useAuth()

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
    <!-- Inner container caps the row at the same width as the page
         content below (notes pages use `max-w-3xl`). On wide
         viewports the brand stays aligned with the article column
         instead of being shoved against the left edge of the screen. -->
    <div class="flex items-center gap-2 px-3 py-1.5 max-w-3xl mx-auto">
      <NuxtLink
        to="/"
        class="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
      >
        <img src="/favicon.svg" class="w-5 h-5 shrink-0" alt="logo">
        <span class="font-semibold text-sm truncate">Notes</span>
      </NuxtLink>

      <div class="flex-1" />

      <UButton
        to="https://github.com/Meizuno/Notes"
        target="_blank"
        external
        variant="ghost"
        color="neutral"
        size="sm"
        aria-label="GitHub repository"
        class="hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true" class="size-4"><path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.55 0-.27-.01-1.16-.01-2.1-3.34.62-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58A12 12 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z"/></svg>
      </UButton>

      <UButton
        v-if="loggedIn"
        to="/notes/new"
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

      <UButton
        v-else
        to="/login"
        icon="i-lucide-log-in"
        variant="ghost"
        color="neutral"
        size="sm"
        label="Log in"
        class="hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary transition-colors"
      />
    </div>
  </header>
</template>
