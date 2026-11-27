import { computed, ref } from "vue";

import { api } from "../lib/api";
import { setAuthLostHandler } from "../lib/http";
import type { AuthConfig, AuthUser } from "../lib/types";

// The signed-in user, shared app-wide — the Nuxt app's useState('auth_user').
//
// Loaded once at boot (main.ts) from GET /api/auth/me. A request that ends in
// a 401 even after the one refresh (lib/http.ts) means the session is gone, so
// the user is cleared and the header falls back to "Log in".
const user = ref<AuthUser | null>(null);

// How this server signs people in: asked the first time somebody signs in,
// then kept — it does not change while the page is open.
let config: Promise<AuthConfig> | null = null;

// The dev sign-in dialog, and where to go once it has signed somebody in.
const devSignIn = ref({ open: false, back: "/" });

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

/**
 * Sign in, then come back to `back` (an app path). There is no sign-in page:
 * this navigates straight to Google's consent screen. Only on a server that
 * offers the dev sign-in and no Google (the dev stack) does it open the dev
 * dialog instead.
 */
export async function signIn(back = "/"): Promise<void> {
  config ??= api.authConfig();
  const { google, devLogin } = await config;
  if (!google && devLogin) {
    devSignIn.value = { open: true, back };
    return;
  }
  window.location.assign(api.googleSignInUrl(back));
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

  return { user, loggedIn, logout, signIn, devSignIn };
}
