<template>
  <div class="flex h-full flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="w-full text-center">
        <h1 class="page-title text-3xl sm:text-4xl font-semibold">
          {{ t("home.title") }}
        </h1>
        <p class="page-subtitle text-sm sm:text-base">
          {{ t("home.subtitle") }}
        </p>
      </div>
    </div>

    <div v-if="data && data.length > 0" class="flex h-full flex-col gap-4">
      <div class="panel p-2 sm:p-4">
        <div class="mb-3 hidden items-center justify-between px-1 sm:flex">
          <div class="text-sm font-medium text-slate-500">
            {{ t("home.all_notes") }}
          </div>
          <UButton
            color="primary"
            variant="solid"
            icon="i-material-symbols-add-rounded"
            @click="navigateTo('/items/new')"
          >
            {{ t("home.create_note") }}
          </UButton>
        </div>
        <UTree
          :items="data"
          :get-key="(i) => String(i.id)"
          expanded-icon="i-lucide-book-open"
          collapsed-icon="i-lucide-book"
          class="notes-tree"
          @select="onSelect"
        >
          <template #item="{ item }">
            <div class="flex w-full items-center justify-between gap-3 py-1">
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <Icon
                  v-if="item.type == 'markdown'"
                  name="i-lucide-file"
                  class="shrink-0 text-cyan-300 size-5"
                />
                <Icon
                  v-else
                  name="i-lucide-book"
                  class="text-indigo-300 size-5"
                />

                <span
                  class="block min-w-0 flex-1 truncate text-left font-medium"
                >
                  {{ item.label }}
                </span>
              </div>

              <ClientOnly>
                <div class="flex shrink-0 items-center gap-1">
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
      </div>

      <UButton
        variant="solid"
        icon="i-material-symbols-add-rounded"
        color="primary"
        size="xl"
        class="floating-actions rounded-full sm:hidden"
        @click="navigateTo('/items/new')"
      />
    </div>
    <div v-else class="flex h-full items-center justify-center">
      <div class="panel p-6 sm:p-8">
        <UEmpty
          size="xl"
          icon="notes:logo"
          :title="t('home.empty_title')"
          :description="t('home.empty_description')"
          class="min-w-sm"
          :actions="[
            {
              icon: 'i-material-symbols-add-rounded',
              size: 'xl',
              label: t('home.create_note'),
              color: 'primary',
              variant: 'solid',
              onClick() {
                navigateTo('/items/new');
              },
            },
          ]"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TreeItemSelectEvent } from "reka-ui";
import type { TreeItem } from "@nuxt/ui";

const { t } = useI18n();
const { data } = await useFetch("/api/items");

const onSelect = (e: TreeItemSelectEvent<TreeItem>) => {
  if (e.detail.value && e.detail.value.type == "markdown") {
    navigateTo(`items/${e.detail.value.id}/content`);
  }
};

const toast = useToast();
const confirmDelete = async (item: any) => {
  const ok = confirm(
    t("home.confirm_delete", {
      label: item.label,
    })
  );
  if (!ok) return;

  await $fetch(`/api/items/${item.id}`, {
    method: "DELETE",
  });

  toast.add({
    title: t("ui.success"),
    description: t("home.deleted", { label: item.label }),
    color: "success",
  });
};
</script>
