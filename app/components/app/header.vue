<template>
  <UHeader :toggle="false">
    <template #title>
      <div class="flex gap-2 items-center">
        <Icon name="i-emojione-v1-note-pad" class="size-7" />
        <span class="text-xl hidden xs:block">Notes</span>
      </div>
    </template>

    <template #right>
      <div v-if="user" class="flex">
        <UUser
          :name="user.name"
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
            @click="logout"
          />
        </UTooltip>
      </div>
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const { user, clear } = useUserSession();
const route = useRoute();
const toast = useToast();

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
