<template>
  <UModal
    v-model:open="open"
    :dismissible="false"
    :close="false"
    :ui="{ body: 'px-2' }"
  >
    <template #title>
      <span>{{ t("modal.path_title") }}</span>
    </template>

    <template #description>
      <UBreadcrumb :items="pathList" />
    </template>

    <template #body>
      <div class="h-64 flex flex-col gap-1">
        <UButton
          v-if="modelValue"
          icon="i-ic-round-arrow-back-ios"
          color="neutral"
          variant="ghost"
          size="lg"
          @click="backInPath"
        >
          ..
        </UButton>
        <UButton
          v-for="item in items"
          icon="i-lucide-book"
          color="neutral"
          variant="ghost"
          size="lg"
          @click="selectFolder(item)"
        >
          {{ item.label }}
        </UButton>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 justify-end w-full">
        <UButton color="primary" variant="subtle" size="lg" @click="select">
          {{ t("ui.select") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { BreadcrumbItem } from "@nuxt/ui";

const { t } = useI18n();

const open = defineModel<boolean | undefined>("open");
const modelValue = defineModel<number | undefined>();
const path = defineModel<string | undefined>("path");

const items = ref<ItemType[]>([]);
const pathList = ref<BreadcrumbItem[]>(
  (path.value?.split("/") || []).map((segment) => ({ label: segment }))
);

if (modelValue.value) {
  const { data } = await useFetch<ItemType[]>(
    `/api/folders/${modelValue.value}`
  );
  items.value = data.value || [];
} else {
  const { data } = await useFetch<ItemType[]>("/api/folders");
  items.value = data.value || [];
}

const selectFolder = async (item: ItemType) => {
  pathList.value.push({
    id: item.id,
    label: item.label,
    icon: "i-lucide-book",
  });
  modelValue.value = item.id;

  const labelList = pathList.value.map((el) => el.label);
  path.value = labelList.join("/");

  const folders = await $fetch<ItemType[]>(`/api/folders/${item.id}`);
  items.value = folders || [];
};

const backInPath = async () => {
  pathList.value.pop();

  if (pathList.value.length == 0) {
    modelValue.value = undefined;
    path.value = undefined;
    const folders = await $fetch<ItemType[]>("/api/folders");
    items.value = folders || [];
  }
};

const select = () => {
  open.value = false;
};
</script>
