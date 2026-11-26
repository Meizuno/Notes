import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";

import App from "./App.vue";
import router from "./router";
import { loadUser } from "./composables/useAuth";
import { stripBase } from "./lib/base";
import "./assets/main.css";

// Who is signed in decides what the header shows and where the router may go,
// so it is known before either runs — the Nuxt app fetched it during SSR for
// the same reason (no "Log in" flashing at a signed-in user). /login skips it:
// whoever is there is signed out by definition.
async function boot() {
  if (stripBase(window.location.pathname) !== "/login") await loadUser();
  const app = createApp(App).use(router).use(ui);
  // The first page's chunk is in before anything is drawn, so the shell never
  // renders around the wrong page (the login page has none).
  await router.isReady();
  app.mount("#app");
}

void boot();
