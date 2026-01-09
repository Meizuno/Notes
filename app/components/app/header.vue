<template>
  <UHeader class="p-2" :toggle="false">
    <template #title>
      <div class="flex gap-2 items-center">
        <Icon name="i-emojione-v1-note-pad" class="size-7" />
        <span class="text-2xl">Notes</span>
      </div>
    </template>

    <template #right>
      <div v-if="user" class="flex">
        <UUser
          :name="user.name"
          size="xl"
          :avatar="{
            src: user.photo,
            icon: 'i-lucide-image',
          }"
        />
        <UTooltip :delay-duration="0" text="Logout">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-logout"
            aria-label="Logout"
            size="xl"
            @click="logout"
          />
        </UTooltip>
      </div>

      <UTooltip v-else :delay-duration="0" text="Login with google">
        <UButton
          color="primary"
          icon="i-flat-color-icons-google"
          aria-label="Google"
          size="xl"
          @click="googleLogin"
        >
          Login
        </UButton>
      </UTooltip>
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const { user, clear } = useUserSession();
const route = useRoute();
const toast = useToast();

const googleLogin = () => {
  window.location.href = "/auth/google";
};

const logout = () => {
  navigateTo("/login");
  clear();
};

onMounted(() => {
  if (route.query.error === "USER_NOT_FOUND") {
    toast.add({ title: "User has no permissions" });

    navigateTo("/", { replace: true });
  }
});
</script>
