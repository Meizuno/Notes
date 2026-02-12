<template>
  <UForm
    :validate="validate"
    :state="state"
    :validate-on="['input']"
    class="panel grid gap-4 p-4 sm:grid-cols-2 sm:p-6"
    @submit="onSubmit"
  >
    <div class="sm:col-span-2">
      <h1 class="page-title text-xl">Create a new item</h1>
      <p class="page-subtitle text-sm">Capture a thought or start a new folder.</p>
    </div>

    <UFormField label="Name" name="label" class="sm:col-span-2">
      <UInput v-model="state.label" size="lg" />
    </UFormField>

    <UFormField label="Type" name="type">
      <USelect v-model="state.type" :items="types" size="lg" />
    </UFormField>

    <UFormField label="Path" name="path" class="sm:col-span-2">
      <UInput v-model="state.path" size="lg" @click="selectPath" />
    </UFormField>

    <div class="sm:col-span-2 flex items-center justify-end gap-2">
      <UButton type="submit" size="lg" color="primary" variant="solid">
        Create
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

const parentId = ref<number>();
const types = ref([
  {
    label: "Folder",
    value: "folder",
    icon: "i-lucide-book",
  },
  {
    label: "File",
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
  if (!state.label) errors.push({ name: "label", message: "Missing value!" });
  if (!state.type) errors.push({ name: "type", message: "Missing value!" });
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
      title: "Success",
      description: `New ${state.type} created.`,
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
