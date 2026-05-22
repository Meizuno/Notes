<template>
  <div class="my-2 overflow-x-auto rounded-lg border border-default">
    <!-- min-w-full + w-max lets the table grow past the container so
         the wrapper's overflow-x-auto actually triggers when columns
         can't fit; on narrow content it still spans the full width. -->
    <table class="min-w-full w-max text-sm">
      <slot />
    </table>
  </div>
</template>
