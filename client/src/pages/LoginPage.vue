<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { api } from "../lib/api";
import { withBase } from "../lib/base";
import { setHead } from "../lib/head";
import { ApiError } from "../lib/http";

// Signing in is the server's: "Sign in with Google" is a navigation to
// /api/auth/google, which comes back through /api/auth/callback with the
// session cookies set — or back here with ?error=. A signed-in visitor never
// sees this page (the server redirects them, and so does the router).

const route = useRoute();
const logo = withBase("/favicon.svg");

setHead({ title: "Notes" });

// Which sign-ins this server offers. Google is assumed until it says
// otherwise, so the button is there from the first frame.
const google = ref(true);
const devLogin = ref(false);
onMounted(async () => {
  const config = await api.authConfig();
  google.value = config.google;
  devLogin.value = config.devLogin;
});

const signIn = () => {
  window.location.href = api.googleSignInUrl();
};

// Dev sign-in: an e-mail, and the server signs it in (the allow-list still
// applies). It answers rather than redirects, so the app goes home itself — a
// full load, as after Google, so everything starts from the new session.
const devEmail = ref("dev@example.com");
const devBusy = ref(false);
const devError = ref<string | null>(null);

async function devSignIn() {
  const email = devEmail.value.trim();
  if (!email || devBusy.value) return;
  devBusy.value = true;
  devError.value = null;
  try {
    await api.devSignIn(email);
    window.location.assign(withBase("/"));
  } catch (e) {
    devError.value = e instanceof ApiError && e.code === "not_allowed" ? "not_allowed" : (e as Error).message;
  } finally {
    devBusy.value = false;
  }
}

// ?error= from the Google round trip, or the dev form's own refusal.
const error = computed(() => devError.value ?? (route.query.error as string | undefined));
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="flex flex-col items-center gap-6 w-full max-w-sm px-4">
      <img :src="logo" class="w-16 h-16" alt="logo" />
      <h1 class="text-2xl font-bold text-highlighted">Notes</h1>

      <UAlert
        v-if="error === 'not_allowed'"
        color="error"
        title="Not allowed"
        description="This e-mail is not allowed here."
      />
      <UAlert
        v-else-if="error === 'auth_failed'"
        color="error"
        title="Authentication error"
        description="Sign-in failed. Please try again."
      />
      <UAlert v-else-if="devError" color="error" title="Dev sign-in failed" :description="devError" />

      <UButton v-if="google" icon="i-simple-icons-google" label="Sign in with Google" size="lg" block @click="signIn" />

      <form v-if="devLogin" class="flex w-full flex-col gap-2 border-t border-default pt-4" @submit.prevent="devSignIn">
        <p class="text-xs text-muted">Dev sign-in (enabled on this server)</p>
        <div class="flex gap-2">
          <UInput v-model="devEmail" type="email" size="sm" class="flex-1" placeholder="e-mail" autocomplete="off" />
          <UButton type="submit" size="sm" color="neutral" variant="soft" label="Sign in" :loading="devBusy" />
        </div>
      </form>
    </div>
  </div>
</template>
