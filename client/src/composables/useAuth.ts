import { computed, ref } from "vue";

import { api } from "../lib/api";
import { setAuthLostHandler } from "../lib/http";
import type { AuthUser } from "../lib/types";

// The signed-in user, shared app-wide — the Nuxt app's useState('auth_user').
//
// Loaded once at boot (main.ts) from GET /api/auth/me. A request that ends in
// a 401 even after the one refresh (lib/http.ts) means the session is gone, so
// the user is cleared and the header falls back to "Log in".
const user = ref<AuthUser | null>(null);

setAuthLostHandler(() => {
  user.value = null;
});

/** Ask the server who is signed in. Anonymous (or unreachable) is null. */
export async function loadUser(): Promise<void> {
  try {
    user.value = (await api.me()).user;
  } catch {
    user.value = null;
  }
}

export function useAuth() {
  const loggedIn = computed(() => Boolean(user.value));

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* best-effort: ignore logout failures, clear locally anyway */
    }
    user.value = null;
  };

  return { user, loggedIn, logout };
}
