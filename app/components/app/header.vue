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
  <header class="flex items-center gap-2 px-3 py-1.5 bg-default dark:bg-[#3D4452] border-b border-default shrink-0">
    <NuxtLink
      to="/"
      class="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <img src="/favicon.svg" class="w-5 h-5" alt="logo">
      <span class="font-semibold text-sm">Knowledge Base</span>
    </NuxtLink>

    <div class="flex-1" />

    <UButton
      to="/notes/new"
      icon="i-lucide-plus"
      variant="ghost"
      color="neutral"
      size="sm"
      label="New"
    />

    <UDropdownMenu v-if="loggedIn" :items="userMenuItems" :ui="{ content: 'w-52' }">
      <UButton variant="ghost" color="neutral" size="sm" class="gap-1.5 px-1.5">
        <UAvatar :src="user?.picture ?? undefined" :alt="user?.name ?? undefined" size="2xs" />
        <UIcon name="i-lucide-chevron-down" class="size-3 text-muted" />
      </UButton>
    </UDropdownMenu>
  </header>
</template>
