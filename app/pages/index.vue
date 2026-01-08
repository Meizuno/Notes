<template>
  <div class="h-full">
    <div v-if="items.length > 0" class="h-full flex flex-col justify-between">
      <UTree
        :items="items"
        size="xl"
        expanded-icon="i-lucide-book-open"
        collapsed-icon="i-lucide-book"
      />

      <div class="w-full flex justify-center">
        <UButton
          variant="subtle"
          icon="i-material-symbols-add-rounded"
          color="neutral"
          class="max-w-xs w-full justify-center"
        />
      </div>
    </div>
    <div v-else class="h-full flex justify-center items-center">
      <UEmpty
        size="xl"
        icon="notes:logo"
        title="No files"
        description="You can create first."
        class="min-w-sm"
        :actions="[
          {
            icon: 'i-material-symbols-add-rounded',
            size: 'xl',
            label: 'Create file',
            color: 'primary',
            variant: 'subtle',
          },
        ]"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const items = ref([
  {
    label: "app/",
    children: [
      {
        label: "composables/",
        children: [
          {
            label: "useAuth.ts",
            icon: "i-lucide-file",
          },
          {
            label: "useUser.ts",
            icon: "i-lucide-file",
          },
        ],
      },
      {
        label: "components/",
        children: [
          {
            label: "Card.vue",
            icon: "i-lucide-file",
          },
          {
            label: "Button.vue",
            icon: "i-lucide-file",
          },
        ],
      },
    ],
  },
  {
    label: "app.vue",
    icon: "i-lucide-file",
  },
  {
    label: "nuxt.config.ts",
    icon: "i-lucide-file",
  },
]);
</script>
