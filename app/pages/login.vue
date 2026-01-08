<template>
  <div class="h-full flex justify-center items-center">
    <div class="flex flex-col items-center gap-4">
      <h1 class="h-full text-2xl">
        <span>Content is private, please login!</span>
      </h1>
      <UTooltip :delay-duration="0" text="Login with google">
        <UButton
          color="neutral"
          icon="i-flat-color-icons-google"
          aria-label="Google"
          size="xl"
          class="w-full text-2xl justify-center"
          @click="googleLogin"
        >
          Google Login
        </UButton>
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const googleLogin = () => {
  window.location.href = "/auth/google";
};
</script>
