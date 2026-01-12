<template>
  <UForm
    :validate="validate"
    :state="state"
    :validate-on="['input']"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField label="Name" name="label">
      <UInput v-model="state.label" />
    </UFormField>

    <UFormField label="Path" name="path">
      <UInput v-model="state.path" @click="selectPath" />
    </UFormField>

    <UButton type="submit"> Update </UButton>
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
  if (!state.label) errors.push({ name: "label", message: "Missing value!" });
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
      title: "Success",
      description: `Update ${data.value?.label}`,
      color: "success",
    });

    navigateTo("/");
  } catch (error) {
    toast.add({
      title: "Error",
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
