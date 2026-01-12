<template>
  <div class="h-dvh flex justify-center items-center">
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

const toast = useToast();
const route = useRoute();

onMounted(() => {
  if (route.query && route.query.error == "USER_NOT_FOUND") {
    toast.add({
      title: "Access denied!",
      icon: "i-mdi-anonymous",
      progress: false,
      color: "error",
      class: "bg-error/15 ring-error",
      close: false,
      duration: 2000,
    });
    navigateTo("/login", { replace: true });
  }
});
</script>
