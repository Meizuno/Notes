<script setup lang="ts">
// The top bar, Forma's: a sticky strip of frosted glass over the page's wash.
// Left, the mark and the name (home) and, on small screens, the button that
// opens the navigation. Right, "New note" and the account chip for somebody
// signed in, or "Log in" — which goes straight to Google and back here.
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import { useAuth } from "../composables/useAuth";
import { useSidebar } from "../composables/useSidebar";
import { useVault } from "../composables/useVault";
import ApiTokens from "./ApiTokens.vue";
import BrandMark from "./BrandMark.vue";

const { user, loggedIn, logout, signIn } = useAuth();
const route = useRoute();
const { refreshVault } = useVault();
const { toggle: toggleSidebar } = useSidebar();

const tokensOpen = ref(false);

// The chip shows the first name; the menu carries the whole name and address.
const firstName = computed(() => (user.value?.name ?? user.value?.email ?? "").split(/[\s@]/)[0] ?? "");

async function signOut() {
  await logout();
  // Private notes leave the sidebar with the session.
  void refreshVault();
}

const userMenuItems = computed(() => [
  [
    {
      type: "label" as const,
      label: user.value?.name ?? user.value?.email ?? "",
      description: user.value?.name ? (user.value.email ?? undefined) : undefined,
      avatar: { src: user.value?.picture || undefined, alt: user.value?.name ?? undefined },
    },
  ],
  [
    {
      label: "API tokens",
      icon: "i-lucide-key-round",
      onSelect: () => {
        tokensOpen.value = true;
      },
    },
  ],
  [
    {
      label: "Log out",
      icon: "i-lucide-log-out",
      color: "error" as const,
      onSelect: signOut,
    },
  ],
]);
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-white/50 bg-white/45 backdrop-blur-xl dark:border-white/5 dark:bg-slate-950/45"
  >
    <div class="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
      <UButton
        class="lg:hidden"
        icon="i-lucide-panel-left"
        variant="ghost"
        color="neutral"
        aria-label="Toggle navigation"
        @click="toggleSidebar"
      />
      <RouterLink to="/" class="flex min-w-0 items-center gap-2 rounded-full transition-opacity hover:opacity-85">
        <BrandMark class="size-7" />
        <span class="truncate text-base font-black tracking-tight text-highlighted sm:text-lg">Notes</span>
      </RouterLink>

      <div class="flex-1" />

      <template v-if="loggedIn">
        <UButton to="/new" icon="i-lucide-plus" color="primary" aria-label="New note">
          <span class="hidden sm:inline">New note</span>
        </UButton>

        <UDropdownMenu :items="userMenuItems" :content="{ align: 'end' }" :ui="{ content: 'w-60' }">
          <button
            type="button"
            class="flex items-center gap-2 rounded-full bg-default/80 p-1 shadow-[0_4px_12px_-8px_rgb(30_60_90/0.4)] transition-colors hover:bg-default sm:pr-3 dark:bg-elevated/70 dark:shadow-none dark:ring-1 dark:ring-white/6"
            aria-label="Account menu"
          >
            <UAvatar :src="user?.picture || undefined" :alt="user?.name ?? user?.email ?? undefined" size="sm" />
            <span class="hidden max-w-32 truncate text-sm font-bold text-highlighted sm:block">{{ firstName }}</span>
            <UIcon name="i-lucide-chevron-down" class="hidden size-4 text-muted sm:block" />
          </button>
        </UDropdownMenu>

        <ApiTokens v-model:open="tokensOpen" />
      </template>

      <UButton v-else icon="i-lucide-log-in" label="Log in" color="primary" @click="signIn(route.fullPath)" />
    </div>
  </header>
</template>
