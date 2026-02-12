<template>
  <div class="flex h-full flex-col gap-4">
    <div class="panel p-4 sm:p-6">
      <div class="mb-3 flex items-center justify-between">
        <div>
          <h1 class="page-title text-xl">Note</h1>
          <p class="page-subtitle text-sm">
            {{ editable ? "Editing mode" : "Read mode" }}
          </p>
        </div>
        <UButton
          v-if="!editable"
          variant="subtle"
          icon="i-material-symbols-edit-rounded"
          color="neutral"
          size="sm"
          class="hidden sm:flex"
          @click="edit"
        >
          Edit
        </UButton>
      </div>

      <UEditor
        :key="key"
        v-model="content"
        :editable="editable"
        :placeholder="editable && !content ? 'Start writing...' : 'Empty file'"
        content-type="markdown"
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
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const key = ref(1);
const editable = ref(false);
const content = ref<string>();
const { data } = await useFetch<ItemType>(`/api/files/${route.params.id}`);

if (data.value && data.value.content) {
  const { data: contentResponse } = await useFetch<string>(data.value?.content);
  content.value = contentResponse.value;
}

const edit = () => {
  editable.value = true;
  key.value = key.value + 1;
};

const save = async () => {
  editable.value = false;
  key.value = key.value + 1;

  if (data.value) {
    await $fetch(`/api/files/${data.value.id}`, {
      method: "PUT",
      body: {
        content: content.value,
      },
    });
  }
};

const cancel = () => {
  editable.value = false;
  key.value = key.value + 1;
};
</script>
