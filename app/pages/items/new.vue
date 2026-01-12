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

    <UFormField label="Type" name="type">
      <USelect v-model="state.type" :items="types" />
    </UFormField>

    <UFormField label="Path" name="path">
      <UInput v-model="state.path" @click="selectPath" />
    </UFormField>

    <UButton type="submit"> Create </UButton>
  </UForm>
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
const onSubmit = (event: FormSubmitEvent<Schema>) => {
  toast.add({
    title: "Success",
    description: "The form has been submitted.",
    color: "success",
  });
  console.log(event.data);
};

const overlay = useOverlay();
const pathModal = overlay.create(ModalPathSelect);
const selectPath = () => {
  pathModal.open({
    modelValue: parentId.value,
    models: {
      path: state.path,
    },
  });
};
</script>
