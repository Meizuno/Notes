<script setup lang="ts">
// Home page = the vault overview. The folder tree lives in the app-wide
// navigation sidebar (AppSidebar), so the home page is just the force-directed
// graph filling the content area.
import HomeGraphView from "../components/HomeGraphView.vue";
import { setHead, siteOrigin } from "../lib/head";

const siteUrl = siteOrigin();
setHead({
  title: "Notes",
  description: "A self-hosted notes vault — browse a force-directed graph or a folder tree of every public note.",
  ogTitle: "Notes",
  ogDescription: "A self-hosted notes vault.",
  ogType: "website",
  ogUrl: siteUrl || undefined,
  robots: "index, follow",
  canonical: siteUrl ? `${siteUrl}/` : undefined,
});
</script>

<template>
  <div class="h-full">
    <HomeGraphView />
  </div>
</template>
