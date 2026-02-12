<template>
  <div class="flex h-full flex-col gap-4">
    <div class="panel">
      <div class="flex items-center justify-between px-8 py-4">
        <div class="flex-1">
          <h1 v-if="!editable" class="page-title text-xl">
            {{ item?.label || t("items.note") }}
          </h1>
          <UInput
            v-else
            v-model="nameDraft"
            class="min-w-56 max-w-sm"
          />
        </div>
        <UButton
          v-if="!editable"
          variant="subtle"
          icon="i-material-symbols-edit-rounded"
          color="secondary"
          class="hidden sm:flex"
          @click="edit"
        >
          {{ t("ui.edit") }}
        </UButton>
      </div>
    </div>

    <div class="panel py-4">
      <EditorNote
        v-model="content"
        :editable="editable"
        :key="key"
        class="editor-shell w-full"
      />
    </div>

    <div class="floating-actions">
      <div v-if="editable" class="flex gap-3">
        <UButton
          variant="subtle"
          icon="i-material-symbols-close-rounded"
          color="neutral"
          size="xl"
          class="rounded-full"
          @click="cancel"
        />
        <UButton
          variant="solid"
          icon="i-material-symbols-check-rounded"
          color="primary"
          size="xl"
          class="rounded-full"
          @click="save"
        />
      </div>
      <UButton
        v-else
        variant="solid"
        icon="i-material-symbols-edit-rounded"
        color="primary"
        size="xl"
        class="rounded-full sm:hidden"
        @click="edit"
      />
    </div>

    <UAlert
      variant="subtle"
      :color="editable ? 'success' : 'info'"
      :title="editable ? t('ui.edit_mode') : t('ui.read_mode')"
      class="sticky bottom-4"
    />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const toast = useToast();

const key = ref(1);
const editable = ref(false);
const content = ref<string>("");
const originalContent = ref<string>("");

const { data: item } = await useFetch<ItemType>(
  `/api/files/${route.params.id}`,
);
const nameDraft = ref("");

const loadContent = async () => {
  if (!item.value?.content) {
    content.value = "";
    originalContent.value = "";
    return;
  }

  const contentResponse = await $fetch<string>(item.value.content, {
    headers: { "Cache-Control": "no-cache" },
  });
  content.value = contentResponse || "";
  originalContent.value = content.value;
};

await loadContent();

watch(
  item,
  (value) => {
    if (!value) return;
    nameDraft.value = value.label;
  },
  { immediate: true },
);

const edit = () => {
  editable.value = true;
  key.value = key.value + 1;
};

const save = async () => {
  editable.value = false;
  key.value = key.value + 1;

  if (item.value) {
    const nextLabel = nameDraft.value.trim();
    if (nextLabel && nextLabel !== item.value.label) {
      const parentId =
        "parentId" in item.value
          ? item.value.parentId
          : (item.value as any).parent_id ?? null;

      await $fetch(`/api/items/${item.value.id}`, {
        method: "PUT",
        body: {
          label: nextLabel,
          parentId,
        },
      });

      item.value = { ...item.value, label: nextLabel };
      nameDraft.value = nextLabel;
    }

    await $fetch(`/api/files/${item.value.id}`, {
      method: "PUT",
      body: {
        content: content.value,
      },
    });

    originalContent.value = content.value;
    toast.add({
      title: t("ui.saved"),
      description: t("ui.content_saved"),
    });
  }
};

const cancel = async () => {
  editable.value = false;
  key.value = key.value + 1;

  if (item.value) {
    nameDraft.value = item.value.label;
  }

  if (content.value !== originalContent.value) {
    await loadContent();
    toast.add({
      title: t("ui.discarded"),
      description: t("ui.changes_discarded"),
    });
  }
};

watch(editable, (value) => {
  if (!value) {
    if (item.value) {
      nameDraft.value = item.value.label;
    }
  }
});
</script>
