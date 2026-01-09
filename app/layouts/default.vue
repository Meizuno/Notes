<template>
  <UContainer class="h-full flex flex-col gap-4 relative">
    <AppHeader />
    <UMain>
      <slot />
    </UMain>
    <UButton
      v-if="$route.path != '/'"
      variant="subtle"
      icon="i-material-symbols-arrow-back-ios-new-rounded"
      color="neutral"
      size="xl"
      class="fixed bottom-4 left-4 rounded-full"
      @click="navigateTo('/')"
    />
  </UContainer>
</template>
