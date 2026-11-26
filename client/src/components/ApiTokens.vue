<script setup lang="ts">
/**
 * Personal API tokens — for ai-chat and anything else that reads the vault on
 * its own: a token goes in an `Authorization: Bearer <token>` header to
 * /api/mcp or /api/prompts/notes. Forma's ApiTokens panel, in a modal opened
 * from the user menu.
 *
 * The raw token is shown once and never again. The server keeps a digest, so a
 * token nobody wrote down is not recoverable, only replaceable. The panel says
 * so while the token is on screen.
 */
import { computed, ref, watch } from "vue";

import { useConfirm } from "../composables/useConfirm";
import { api } from "../lib/api";
import { ApiError } from "../lib/http";
import type { ApiToken } from "../lib/types";

const open = defineModel<boolean>("open", { default: false });

const { confirm } = useConfirm();

const tokens = ref<ApiToken[]>([]);
const loaded = ref(false);
const busy = ref(false);
/** What went wrong, in the server's words — or that it never answered. */
const failed = ref("");

const name = ref("");
/** The one moment the raw token exists outside the server. */
const minted = ref("");
const copied = ref(false);

const problem = computed(() => (name.value.trim() ? "" : "Give the token a name."));

function reason(e: unknown): string {
  if (e instanceof ApiError) return e.message || "That did not work.";
  return "The server could not be reached.";
}

async function load() {
  failed.value = "";
  try {
    tokens.value = await api.listTokens();
  } catch (e) {
    failed.value = reason(e);
  } finally {
    loaded.value = true;
  }
}

async function create() {
  if (problem.value || busy.value) return;
  busy.value = true;
  failed.value = "";
  try {
    const answer = await api.createToken(name.value.trim());
    minted.value = answer.token;
    copied.value = false;
    name.value = "";
    await load();
  } catch (e) {
    failed.value = reason(e);
  } finally {
    busy.value = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(minted.value);
    copied.value = true;
  } catch {
    // A clipboard the browser will not open is not worth an error message: the
    // token is on screen and can be selected by hand.
  }
}

async function revoke(token: ApiToken) {
  const ok = await confirm({
    title: `Revoke "${token.name}"?`,
    description: "Anything still using this token loses access at once. This cannot be undone.",
    confirmLabel: "Revoke",
  });
  if (!ok) return;
  try {
    tokens.value = await api.revokeToken(token.id);
  } catch (e) {
    failed.value = reason(e);
  }
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });

// Fetched each time it opens; the minted token goes when it closes — it is
// on screen for as long as the panel is, and then gone.
watch(open, (isOpen) => {
  if (isOpen) void load();
  else {
    minted.value = "";
    copied.value = false;
    failed.value = "";
  }
});
</script>

<template>
  <UModal
    v-model:open="open"
    title="API tokens"
    description="For ai-chat and other tools: send a token as Authorization: Bearer <token> to /api/mcp or /api/prompts/notes."
  >
    <template #body>
      <div
        v-if="minted"
        class="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3"
      >
        <p class="text-sm font-medium text-highlighted">Your new token</p>
        <p class="mt-0.5 text-xs text-muted">Copy it now — it will not be shown again.</p>
        <div class="mt-2 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-md bg-default px-2 py-1.5 font-mono text-xs">{{ minted }}</code>
          <UButton
            size="sm"
            color="neutral"
            variant="subtle"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy'"
            @click="copy"
          />
        </div>
        <div class="mt-2 flex justify-end">
          <UButton size="xs" color="neutral" variant="ghost" label="Done" @click="minted = ''" />
        </div>
      </div>

      <form class="flex items-start gap-2" @submit.prevent="create">
        <UInput v-model="name" size="sm" class="flex-1" placeholder="Token name (e.g. ai-chat)" maxlength="100" />
        <UButton type="submit" size="sm" icon="i-lucide-plus" label="Create" :loading="busy" :disabled="!!problem" />
      </form>

      <p v-if="failed" class="mt-3 text-sm text-error">{{ failed }}</p>

      <div v-if="loaded" class="mt-4 border-t border-default pt-3">
        <p v-if="!tokens.length" class="text-sm text-muted">No tokens yet.</p>
        <ul v-else class="divide-y divide-default">
          <li v-for="token in tokens" :key="token.id" class="flex items-start justify-between gap-3 py-2.5">
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-highlighted">{{ token.name }}</span>
              <span class="mt-0.5 block text-xs text-muted">
                Created {{ when(token.createdAt) }},
                {{ token.lastUsedAt ? `last used ${when(token.lastUsedAt)}` : "never used" }}
              </span>
            </span>
            <UButton size="xs" color="error" variant="ghost" label="Revoke" @click="revoke(token)" />
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
