<script setup lang="ts">
import { ref } from "vue";

import { useAuth } from "../composables/useAuth";
import { api } from "../lib/api";
import { withBase } from "../lib/base";
import { ApiError } from "../lib/http";

// The dev sign-in (NOTES_DEV_LOGIN, which the image refuses): an allowed
// e-mail, and the server signs it in, no Google and no password. "Log in"
// opens it on a server that offers it and no Google — the dev stack.
//
// The server answers rather than redirects, so the app goes on itself: a full
// load, as after Google, so everything starts from the new session.
const { devSignIn } = useAuth();

const email = ref("dev@example.com");
const busy = ref(false);
const error = ref<string | null>(null);

async function submit() {
  const address = email.value.trim();
  if (!address || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await api.devSignIn(address);
    window.location.assign(withBase(devSignIn.value.back));
  } catch (e) {
    error.value =
      e instanceof ApiError && e.code === "not_allowed" ? "This e-mail is not allowed here." : (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="devSignIn.open"
    title="Dev sign-in"
    description="Enabled on this server only: any allowed e-mail, no password."
  >
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <UAlert v-if="error" color="error" title="Dev sign-in failed" :description="error" />
        <div class="flex gap-2">
          <UInput v-model="email" type="email" class="flex-1" placeholder="e-mail" autocomplete="off" />
          <UButton type="submit" label="Sign in" :loading="busy" />
        </div>
      </form>
    </template>
  </UModal>
</template>
