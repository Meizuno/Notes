<script setup lang="ts">
// Singleton modal driven by `useConfirm()`. Mounted once in `app.vue`.
// All delete confirmations across the app share this instance.

const { _state: state, _settle: settle } = useConfirm()

// Backdrop / ESC closes the modal via UModal's internal handling,
// which flips `state.open` to false. Treat that as "cancel" so the
// awaiting promise resolves with `false`.
watch(() => state.open, (val) => {
  if (!val && state.resolver) settle(false)
})
</script>

<template>
  <UModal
    v-model:open="state.open"
    :title="state.opts?.title"
    :description="state.opts?.description"
  >
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          variant="ghost"
          color="neutral"
          :label="state.opts?.cancelLabel ?? 'Cancel'"
          @click="settle(false)"
        />
        <UButton
          :color="state.opts?.confirmColor ?? 'error'"
          :label="state.opts?.confirmLabel ?? 'Delete'"
          @click="settle(true)"
        />
      </div>
    </template>
  </UModal>
</template>
