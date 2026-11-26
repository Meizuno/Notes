<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";

import AppFooter from "./components/AppFooter.vue";
import AppHeader from "./components/AppHeader.vue";
import AppSidebar from "./components/AppSidebar.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import RouteAnnouncer from "./components/RouteAnnouncer.vue";

const route = useRoute();
const showShell = computed(() => !route.meta.bare);

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
    <div v-if="showShell" class="flex flex-col h-dvh w-full overflow-hidden">
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
    <RouterView v-else />
    <ConfirmDialog />
  </UApp>
</template>
