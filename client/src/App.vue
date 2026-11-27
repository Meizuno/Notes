<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { ref, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";

import AppFooter from "./components/AppFooter.vue";
import AppHeader from "./components/AppHeader.vue";
import AppSidebar from "./components/AppSidebar.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import DevSignIn from "./components/DevSignIn.vue";
import RouteAnnouncer from "./components/RouteAnnouncer.vue";

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

// The page scrolls inside <main>, not the window, so the router's own scroll
// handling never reaches it: start each page at its top.
const main = ref<HTMLElement | null>(null);
watch(
  () => route.path,
  () => {
    if (main.value) main.value.scrollTop = 0;
  },
);
</script>

<template>
  <UApp>
    <RouteAnnouncer />
    <div class="flex flex-col h-dvh w-full overflow-hidden">
      <AppHeader />
      <!-- `relative` anchors the small-screen sidebar drawer + backdrop to the
           content row (below the header), not the whole viewport. -->
      <div class="relative flex flex-1 min-h-0">
        <AppSidebar />
        <main ref="main" class="flex-1 min-w-0 overflow-auto">
          <!-- Keyed on the path, as NuxtPage keyed its pages: another note is
               a fresh page, not the old one with new props. -->
          <RouterView v-slot="{ Component, route: r }">
            <component :is="Component" :key="r.path" />
          </RouterView>
        </main>
      </div>
      <AppFooter />
    </div>
    <ConfirmDialog />
    <DevSignIn />
  </UApp>
</template>
