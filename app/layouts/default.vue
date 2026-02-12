<template>
  <div class="app-decor" aria-hidden="true">
    <div class="app-orb orb-1"></div>
    <div class="app-orb orb-2"></div>
  </div>
  <UContainer class="app-shell relative flex flex-col gap-4 px-4 pb-10 pt-4 sm:pt-6">
    <AppHeader />
    <UMain class="relative z-10">
      <slot />
    </UMain>
    <UButton
      v-if="$route.path != '/'"
      variant="subtle"
      icon="i-material-symbols-arrow-back-ios-new-rounded"
      color="neutral"
      size="xl"
      class="floating-back rounded-full"
      @click="navigateTo('/')"
    />
  </UContainer>
</template>
