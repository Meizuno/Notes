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
          <div class="text-lg font-semibold">{{ t("app.title") }}</div>
          <div class="hidden text-xs text-slate-400 sm:block">
            {{ t("app.subtitle") }}
          </div>
        </div>
      </div>
    </template>

    <template #right>
      <div class="flex items-center gap-2">
        <ClientOnly>
          <ULocaleSelect
            v-model="selectedLocale"
            :locales="localeItems"
            color="neutral"
            variant="ghost"
            :aria-label="t('ui.select_language')"
          />
        </ClientOnly>
        <template v-if="user">
          <UUser
            :name="user.name"
            :avatar="{
              src: user.photo,
              icon: 'i-lucide-image',
            }"
            :ui="{
              name: 'hidden sm:flex',
            }"
          />
          <UTooltip :delay-duration="0" :text="t('auth.logout')">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-logout"
              :aria-label="t('auth.logout')"
              @click="logout"
            />
          </UTooltip>
        </template>
        <ClientOnly>
          <UButton
            color="neutral"
            variant="ghost"
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            :aria-label="t('ui.toggle_theme')"
            @click="toggleTheme"
          />
        </ClientOnly>
      </div>
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n();
const { user, clear } = useUserSession();
const route = useRoute();
const toast = useToast();
const colorMode = useColorMode();

const isDark = computed(() => colorMode.value === "dark");
const localeItems = computed(() =>
  Array.isArray(locales.value) ? locales.value : (locales as any)
);
const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    if (setLocale) {
      setLocale(value);
    } else {
      locale.value = value;
    }
  },
});

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
    toast.add({ title: t("errors.user_no_permissions") });

    navigateTo("/", { replace: true });
  }
});
</script>
