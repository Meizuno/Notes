export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession();
  let requested = false;

  const requestRefreshToken = async () => {
    if (requested || !loggedIn.value) return;
    requested = true;
    try {
      await $fetch("/api/auth/refresh", { method: "POST" });
    } catch {
      requested = false;
    }
  };

  if (loggedIn.value) {
    void requestRefreshToken();
  } else {
    watch(loggedIn, (value) => {
      if (value) {
        void requestRefreshToken();
      }
    });
  }
});
