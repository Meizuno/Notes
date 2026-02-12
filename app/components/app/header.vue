<template>
  <UHeader :toggle="false" class="panel panel-strong relative z-10">
    <template #title>
      <div class="flex items-center gap-3">
        <div
          class="flex size-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10"
        >
          <Icon name="i-emojione-v1-note-pad" class="size-6" />
        </div>
        <div class="leading-tight">
          <div class="text-lg font-semibold">Notes</div>
          <div class="hidden text-xs text-slate-400 sm:block">
            Organize everything in one calm space
          </div>
        </div>
      </div>
    </template>

    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          aria-label="Toggle theme"
          @click="toggleTheme"
        />
      </div>
      <div v-if="user" class="flex items-center gap-2">
        <UButton
          v-if="route.path === '/'"
          color="primary"
          variant="solid"
          icon="i-material-symbols-add-rounded"
          size="sm"
          class="hidden sm:flex"
          @click="goNew"
        >
          New
        </UButton>
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
const colorMode = useColorMode();

const isDark = computed(() => colorMode.value === "dark");

const goNew = () => {
  navigateTo("/items/new");
};

const toggleTheme = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
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
