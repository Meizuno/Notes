<template>
  <UForm
    :validate="validate"
    :state="state"
    :validate-on="['input']"
    class="panel grid gap-4 p-4 sm:grid-cols-2 sm:p-6"
    @submit="onSubmit"
  >
    <div class="sm:col-span-2">
      <h1 class="page-title text-xl">{{ t("items.update_title") }}</h1>
      <p class="page-subtitle text-sm">{{ t("items.update_subtitle") }}</p>
    </div>

    <UFormField :label="t('ui.name')" name="label" class="sm:col-span-2">
      <UInput v-model="state.label" size="lg" />
    </UFormField>

    <UFormField :label="t('ui.path')" name="path" class="sm:col-span-2">
      <UInput v-model="state.path" size="lg" @click="selectPath" />
    </UFormField>

    <div class="sm:col-span-2 flex items-center justify-end gap-2">
      <UButton type="submit" size="lg" color="primary" variant="solid">
        {{ t("ui.update") }}
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

const route = useRoute();
const itemId = route.params.id;
const { data } = await useFetch<{
  id: number;
  label: string;
  type: string;
  parentId: number;
  path: string;
}>(`/api/items/${itemId}`);

const parentId = ref(data.value?.parentId);
const state = reactive({
  label: data.value?.label,
  path: data.value?.path,
});

type Schema = typeof state;

const validate = (state: Partial<Schema>): FormError[] => {
  const errors = [];
  if (!state.label) {
    errors.push({ name: "label", message: t("errors.missing_value") });
  }
  return errors;
};

const toast = useToast();
const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await $fetch(`/api/items/${itemId}`, {
      method: "PUT",
      body: {
        label: event.data.label,
        parentId: parentId.value,
      },
    });

    toast.add({
      title: t("ui.success"),
      description: t("items.updated", { label: data.value?.label }),
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
