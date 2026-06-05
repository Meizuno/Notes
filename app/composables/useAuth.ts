export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth_user', () => null)
  const loggedIn = computed(() => Boolean(user.value))

  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch { /* best-effort: ignore logout failures, clear locally anyway */ }
    user.value = null
  }

  return { user, loggedIn, logout }
}
