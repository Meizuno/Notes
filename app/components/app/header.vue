<script setup lang="ts">
// Top header strip — visible at every breakpoint. Brand on the left
// links to the home view; the right side carries the global "new
// note" action and the user dropdown for signed-in viewers.
// Anonymous viewers see no "Log in" affordance — the route is
// reachable directly at /login by anyone who knows it.

const { user, loggedIn, logout } = useAuth()

// The right cluster carries only the signed-in actions now (the home-view
// toggle was removed — large screens show graph + tree together, small
// screens are tree-only). Empty for anonymous viewers, so the brand
// centres on its own.
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
    <!-- Full-width row. justify-between when the right cluster is
         non-empty (brand hugs the left, cluster hugs the right);
         justify-center when the cluster is empty so the brand sits
         dead-centre on its own. The discrete swap avoids the
         proportional drift a single 3-zone layout would give. -->
    <div
      class="flex items-center gap-2 px-4 py-1.5"
      :class="hasRightItems ? 'justify-between' : 'justify-center'"
    >
      <NuxtLink
        to="/"
        class="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
      >
        <img src="/favicon.svg" class="w-5 h-5 shrink-0" alt="logo">
        <span class="font-semibold text-sm truncate">Notes</span>
      </NuxtLink>

      <div v-if="hasRightItems" class="flex items-center gap-2">
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
      </div>
    </div>
  </header>
</template>
