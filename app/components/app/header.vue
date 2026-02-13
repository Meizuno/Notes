<template>
  <header
    class="panel panel-strong relative flex justify-between py-2 px-3"
  >
    <UButton variant="link" class="flex items-center gap-3" to="/">
      <div
        class="flex size-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10"
      >
        <Icon name="i-emojione-v1-note-pad" class="size-6" />
      </div>
      <div class="hidden sm:block leading-tight">
        <div class="text-lg font-semibold">{{ t("app.title") }}</div>
        <div class="text-xs text-slate-400">
          {{ t("app.subtitle") }}
        </div>
      </div>
    </UButton>

    <div class="flex items-center gap-2">
      <ClientOnly>
        <ULocaleSelect
          v-model="selectedLocale"
          :locales="localeItems"
          color="neutral"
          variant="ghost"
          class="hidden sm:flex"
          :aria-label="t('ui.select_language')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :icon="currentLocaleIcon"
          class="sm:hidden"
          :aria-label="t('ui.select_language')"
          @click="cycleLocale"
        />
      </ClientOnly>
      <ClientOnly>
        <UButton
          color="neutral"
          variant="ghost"
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          :aria-label="t('ui.toggle_theme')"
          @click="toggleTheme"
        />
      </ClientOnly>
      <UDropdownMenu
        v-if="user"
        :items="userMenu"
        :content="{
          align: 'end',
          side: 'bottom',
          sideOffset: 8,
        }"
      >
        <UUser
          :name="user.name"
          :avatar="{
            src: user.photo,
            icon: 'i-lucide-image',
          }"
          :ui="{
            name: 'hidden',
          }"
          class="cursor-pointer"
        />
      </UDropdownMenu>
    </div>
  </header>
</template>

<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n();
const { user, clear } = useUserSession();
const route = useRoute();
const toast = useToast();
const colorMode = useColorMode();

const isDark = computed(() => colorMode.value === "dark");
const localeItems = computed(() =>
  Array.isArray(locales.value) ? locales.value : (locales as any),
);
const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    if (setLocale) {
      setLocale(value as any);
    } else {
      locale.value = value as any;
    }
  },
});
const userMenu = computed(() => [
  {
    label: t("auth.logout"),
    icon: "i-material-symbols-logout",
    color: "error" as const,
    onSelect: logout,
  },
]);
const currentLocaleIcon = computed(() => {
  switch (selectedLocale.value) {
    case "cs":
      return "i-twemoji-flag-czechia";
    case "ua":
      return "i-twemoji-flag-ukraine";
    case "en":
    default:
      return "i-twemoji-flag-united-states";
  }
});
const cycleLocale = () => {
  const list = Array.isArray(localeItems.value) ? localeItems.value : [];
  if (!list.length) return;
  const codes = list.map((loc: any) => loc.code || loc);
  const currentIndex = codes.indexOf(selectedLocale.value);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % codes.length;
  selectedLocale.value = codes[nextIndex];
};

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
