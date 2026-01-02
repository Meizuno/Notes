<template>
  <div class="h-full">
    <div
      v-if="!loggedIn"
      class="h-full flex items-center justify-center gap-1 text-muted text-lg"
    >
      <Icon name="i-material-symbols-info-outline-rounded" />
      <span>No login user</span>
    </div>
    <div v-else class="flex flex-col">
      <UTree :items="items" size="xl" />

      <div class="w-full flex justify-center">
        <UButton
          variant="subtle"
          icon="i-material-symbols-add-rounded"
          color="neutral"
          size="xl"
          class="max-w-xs w-full justify-center"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { loggedIn } = useUserSession();
const items = ref([]);

watch(loggedIn, (newVal: boolean) => {
  if (!newVal) {
    items.value = [];
  }
});
</script>
