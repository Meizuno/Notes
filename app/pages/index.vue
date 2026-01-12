<template>
  <div class="h-full">
    <div
      v-if="data && data.length > 0"
      class="h-full flex flex-col justify-between"
    >
      <UTree
        :items="data"
        :get-key="(i) => String(i.id)"
        size="xl"
        expanded-icon="i-lucide-book-open"
        collapsed-icon="i-lucide-book"
        @select="onSelect"
      >
        <template #item="{ item }">
          <div class="flex items-center justify-between gap-2 w-full">
            <div class="flex gap-2 items-center min-w-0">
              <Icon v-if="item.type == 'markdown'" name="i-lucide-file" class="shrink-0" />
              <Icon v-else name="i-lucide-book" />

              <span class="truncate">
                {{ item.label }}
              </span>
            </div>

            <ClientOnly>
              <div class="flex shrink-0">
                <UButton
                  icon="i-material-symbols-edit-rounded"
                  variant="ghost"
                  color="info"
                  @click="navigateTo(`/items/${item.id}/edit`)"
                />
                <UButton
                  icon="i-material-symbols-delete-rounded"
                  variant="ghost"
                  color="error"
                  @click="confirmDelete(item)"
                />
              </div>
            </ClientOnly>
          </div>
        </template>
      </UTree>

      <UButton
        variant="subtle"
        icon="i-material-symbols-add-rounded"
        color="neutral"
        size="xl"
        class="fixed bottom-4 right-4 rounded-full w-fit ml-auto"
        @click="navigateTo('/items/new')"
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
            onClick() {
              navigateTo('/items/new');
            },
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
    navigateTo(`items/${e.detail.value.id}/content`);
  }
};

const toast = useToast();
const confirmDelete = async (item: any) => {
  const ok = confirm(`Delete "${item.label}"?`);
  if (!ok) return;

  await $fetch(`/api/items/${item.id}`, {
    method: "DELETE",
  });

  toast.add({
    title: "Success",
    description: `Deleted "${item.label}".`,
    color: "success",
  });
};
</script>
