<template>
  <div class="h-full flex flex-col gap-2">
    <UEditor
      :key="key"
      v-model="content"
      :editable="editable"
      :placeholder="editable && !content ? 'Start writing...' : 'Empty file'"
      content-type="markdown"
      class="w-full"
    />
    <div class="fixed bottom-4 right-4 w-fit ml-auto">
      <div v-if="editable" class="flex gap-4">
        <UButton
          variant="subtle"
          icon="i-material-symbols-close-rounded"
          color="neutral"
          size="xl"
          class="rounded-full"
          @click="cancel"
        />
        <UButton
          variant="subtle"
          icon="i-material-symbols-check-rounded"
          color="neutral"
          size="xl"
          class="rounded-full"
          @click="save"
        />
      </div>
      <UButton
        v-else
        variant="subtle"
        icon="i-material-symbols-edit-rounded"
        color="neutral"
        size="xl"
        class="rounded-full"
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
