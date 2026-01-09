<template>
  <div class="h-full">
    <div
      v-if="data && data.length > 0"
      class="h-full flex flex-col justify-between relative"
    >
      <UTree
        :items="data"
        size="xl"
        expanded-icon="i-lucide-book-open"
        collapsed-icon="i-lucide-book"
        @select="onSelect"
      />

      <UButton
        variant="subtle"
        icon="i-material-symbols-add-rounded"
        color="neutral"
        size="xl"
        class="sticky bottom-4 rounded-full w-fit ml-auto"
      />
    </div>
    <div v-else class="h-full flex justify-center items-center">
      <UEmpty
        size="xl"
        icon="notes:logo"
        title="No files"
        description="You can create first."
        class="min-w-sm"
        :actions="[
          {
            icon: 'i-material-symbols-add-rounded',
            size: 'xl',
            label: 'Create file',
            color: 'primary',
            variant: 'subtle',
          },
        ]"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TreeItemSelectEvent } from "reka-ui";
import type { TreeItem } from "@nuxt/ui";

const { data } = await useFetch("/api/items");

const onSelect = (e: TreeItemSelectEvent<TreeItem>) => {
  if (e.detail.value && e.detail.value.type == "markdown") {
    navigateTo(`files/${e.detail.value.id}/content`);
  }
};
</script>
