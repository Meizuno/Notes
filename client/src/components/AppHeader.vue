<script setup lang="ts">
// Top header strip — visible at every breakpoint. Brand on the left links to
// the home view; the right side carries the global "new note" action and the
// user dropdown for signed-in viewers, and a "Log in" button for anonymous
// viewers — which goes straight to Google and back to this page.
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import { useAuth } from "../composables/useAuth";
import { useSidebar } from "../composables/useSidebar";
import { useVault } from "../composables/useVault";
import { withBase } from "../lib/base";
import ApiTokens from "./ApiTokens.vue";

const { user, loggedIn, logout, signIn } = useAuth();
const route = useRoute();
const { refreshVault } = useVault();

// Toggles the navigation sidebar's off-canvas drawer on small screens (the
// sidebar is always visible on large, so the button is lg:hidden).
const { toggle: toggleSidebar } = useSidebar();

const tokensOpen = ref(false);
const logo = withBase("/favicon.svg");

async function signOut() {
  await logout();
  // Private notes leave the sidebar with the session.
  void refreshVault();
}

const userMenuItems = computed(() => [
  [
    {
      label: user.value?.name ?? user.value?.email ?? "",
      avatar: { src: user.value?.picture || undefined, alt: user.value?.name ?? undefined },
      disabled: true,
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
        <RouterLink to="/" class="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
          <img :src="logo" class="w-5 h-5 shrink-0" alt="logo" />
          <span class="font-semibold text-sm truncate">Notes</span>
        </RouterLink>
      </div>

      <div class="flex items-center gap-2">
        <template v-if="loggedIn">
          <UButton
            to="/new"
            icon="i-lucide-plus"
            variant="ghost"
            color="neutral"
            size="sm"
            label="New"
            class="hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary transition-colors"
          />

          <UDropdownMenu :items="userMenuItems" :ui="{ content: 'w-52' }">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              class="gap-1.5 px-1.5 hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              aria-label="Account menu"
            >
              <UAvatar :src="user?.picture || undefined" :alt="user?.name ?? undefined" size="2xs" />
              <UIcon name="i-lucide-chevron-down" class="size-3 text-muted" />
            </UButton>
          </UDropdownMenu>

          <ApiTokens v-model:open="tokensOpen" />
        </template>

        <UButton
          v-else
          icon="i-lucide-log-in"
          variant="ghost"
          color="neutral"
          size="sm"
          label="Log in"
          class="hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary transition-colors"
          @click="signIn(route.fullPath)"
        />
      </div>
    </div>
  </header>
</template>
