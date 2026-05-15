<script setup lang="ts">
const { loggedIn } = useAuth()
const route = useRoute()
const error = computed(() => route.query.error as string | undefined)

if (loggedIn.value) {
  await navigateTo('/')
}

const signIn = () => { window.location.href = '/api/auth/google' }
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="flex flex-col items-center gap-6 w-full max-w-sm px-4">
      <img src="/favicon.svg" class="w-16 h-16" alt="logo">
      <h1 class="text-2xl font-bold text-highlighted">Notes</h1>

      <UAlert
        v-if="error === 'missing_tokens'"
        color="error"
        title="Authentication error"
        description="Missing tokens. Please try again."
      />
      <UAlert
        v-else-if="error === 'invalid_token'"
        color="error"
        title="Authentication error"
        description="Invalid token. Please try again."
      />

      <UButton
        icon="i-simple-icons-google"
        label="Sign in with Google"
        size="lg"
        block
        @click="signIn"
      />
    </div>
  </div>
</template>
