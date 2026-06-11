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
