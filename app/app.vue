<template>
  <UApp>
    <AppLoading v-if="isLoading" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
const { isLoading } = useLoadingIndicator();
</script>
