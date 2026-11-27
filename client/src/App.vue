<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";

import AppHeader from "./components/AppHeader.vue";
import AppSidebar from "./components/AppSidebar.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import DevSignIn from "./components/DevSignIn.vue";
import RouteAnnouncer from "./components/RouteAnnouncer.vue";
import { useSearch } from "./composables/useSearch";
import { useSidebar } from "./composables/useSidebar";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// A sign-in that failed comes back to the home page with ?auth_error=<code>
// (there is no sign-in page to show it on): said once, then taken out of the
// address so a reload does not say it again.
const SIGN_IN_ERRORS: Record<string, { title: string; description: string }> = {
  not_allowed: { title: "Not allowed", description: "This e-mail is not allowed here." },
  auth_failed: { title: "Sign-in failed", description: "Please try again." },
};
watch(
  () => route.query.auth_error,
  (code) => {
    if (typeof code !== "string") return;
    toast.add({ ...(SIGN_IN_ERRORS[code] ?? SIGN_IN_ERRORS.auth_failed!), color: "error", icon: "i-lucide-circle-alert" });
    const query = { ...route.query };
    delete query.auth_error;
    void router.replace({ query });
  },
  { immediate: true },
);

// "/" (or Ctrl/⌘+K) anywhere outside a field jumps to the search box — in the
// aside on large screens, in the slide-over (opened for it) on small ones.
const { requestFocus } = useSearch();
const { open: sidebarOpen } = useSidebar();
function onShortcut(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = !!target?.closest("input, textarea, select, [contenteditable='true']");
  const slash = e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
  const palette = e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey);
  if (!slash && !palette) return;
  e.preventDefault();
  if (!window.matchMedia("(min-width: 64rem)").matches) sidebarOpen.value = true;
  requestFocus();
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <RouteAnnouncer />
    <AppHeader />
    <!-- Forma's sidebar layout: the page beside a sticky aside from lg up. -->
    <div
      class="mx-auto w-full max-w-7xl px-3 pt-4 pb-10 sm:px-6 sm:pt-6 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-6"
    >
      <AppSidebar />
      <main class="min-w-0">
        <!-- Keyed on the path, as NuxtPage keyed its pages: another note is
             a fresh page, not the old one with new props. -->
        <RouterView v-slot="{ Component, route: r }">
          <component :is="Component" :key="r.path" />
        </RouterView>
      </main>
    </div>
    <ConfirmDialog />
    <DevSignIn />
  </UApp>
</template>
