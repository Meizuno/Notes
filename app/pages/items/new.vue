<template>
  <UForm
    :validate="validate"
    :state="state"
    :validate-on="['input']"
    class="panel grid gap-4 p-4 sm:grid-cols-2 sm:p-6"
    @submit="onSubmit"
  >
    <div class="sm:col-span-2">
      <h1 class="page-title text-xl">{{ t("items.new_title") }}</h1>
      <p class="page-subtitle text-sm">{{ t("items.new_subtitle") }}</p>
    </div>

    <UFormField :label="t('ui.name')" name="label" class="sm:col-span-2">
      <UInput v-model="state.label" size="lg" />
    </UFormField>

    <UFormField :label="t('ui.type')" name="type">
      <USelect v-model="state.type" :items="types" size="lg" />
    </UFormField>

    <UFormField :label="t('ui.path')" name="path" class="sm:col-span-2">
      <UInput v-model="state.path" size="lg" @click="selectPath" />
    </UFormField>

    <div class="sm:col-span-2 flex items-center justify-end gap-2">
      <UButton type="submit" size="lg" color="primary" variant="solid">
        {{ t("ui.create") }}
      </UButton>
    </div>
  </UForm>
  <ModalPathSelect
    v-model:open="openSelectPath"
    v-model="parentId"
    v-model:path="state.path"
  />
</template>

<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import { ModalPathSelect } from "#components";

const { t } = useI18n();

const parentId = ref<number>();
const resolveTypeLabel = (value?: string) =>
  value === "folder" ? t("items.type.folder") : t("items.type.file");
const types = computed(() => [
  {
    label: resolveTypeLabel("folder"),
    value: "folder",
    icon: "i-lucide-book",
  },
  {
    label: resolveTypeLabel("markdown"),
    value: "markdown",
    icon: "i-lucide-file",
  },
]);
const state = reactive({
  label: undefined,
  type: undefined,
  path: undefined,
});

type Schema = typeof state;

const validate = (state: Partial<Schema>): FormError[] => {
  const errors = [];
  if (!state.label) {
    errors.push({ name: "label", message: t("errors.missing_value") });
  }
  if (!state.type) {
    errors.push({ name: "type", message: t("errors.missing_value") });
  }
  return errors;
};

const toast = useToast();
const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await $fetch("/api/items", {
      method: "POST",
      body: {
        label: event.data.label,
        type: event.data.type,
        parentId: parentId.value,
      },
    });

    toast.add({
      title: t("ui.success"),
      description: t("items.created", {
        type: resolveTypeLabel(state.type),
      }),
      color: "success",
    });

    navigateTo("/");
  } catch (error) {
    toast.add({
      title: t("ui.error"),
      description: error as string,
      color: "error",
    });
  }
};

const openSelectPath = ref(false);
const selectPath = () => {
  openSelectPath.value = true;
};
</script>
