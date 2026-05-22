<template>
  <div class="my-2 overflow-x-auto rounded-lg border border-default">
    <!-- `w-full` fills the container; tables have a special sizing
         rule where unwrappable content (long words, explicit nowrap)
         still pushes the table wider than 100%, which trips the
         wrapper's overflow-x-auto. So we get a flush-to-edges table
         on narrow content AND horizontal scroll when columns can't
         compress further. -->
    <table class="w-full text-sm">
      <slot />
    </table>
  </div>
</template>
