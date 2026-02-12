<template>
  <div class="flex min-h-dvh items-center justify-center px-4 py-10">
    <div class="auth-card text-center p-8">
      <div class="mb-6 flex items-center justify-center">
        <div
          class="flex size-14 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/10"
        >
          <Icon name="i-emojione-v1-note-pad" class="size-8" />
        </div>
      </div>
      <h1 class="text-2xl font-semibold">{{ t("auth.welcome_back") }}</h1>
      <p class="mt-2 text-sm text-slate-400">
        {{ t("auth.subtitle") }}
      </p>
      <div class="mt-6">
        <UTooltip :delay-duration="0" :text="t('auth.login_google')">
          <UButton
            color="primary"
            icon="i-flat-color-icons-google"
            :aria-label="t('auth.login_google')"
            size="xl"
            class="w-full justify-center text-lg"
            @click="googleLogin"
          >
            {{ t("auth.continue_google") }}
          </UButton>
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const { t } = useI18n();

const googleLogin = () => {
  window.location.href = "/auth/google";
};

const toast = useToast();
const route = useRoute();

onMounted(() => {
  if (route.query && route.query.error == "USER_NOT_FOUND") {
    toast.add({
      title: t("auth.access_denied"),
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
