<template>
  <div class="app-decor" aria-hidden="true">
    <div class="app-orb orb-1"></div>
    <div class="app-orb orb-2"></div>
  </div>
  <UContainer class="app-shell flex flex-col p-2 sm:p-4 gap-2 sm:gap-4">
    <AppHeader class="sticky top-0 z-10" />
    <main>
      <slot />
    </main>
  </UContainer>
</template>
