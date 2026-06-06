import { getCookie, getHeader, setCookie, deleteCookie } from 'h3'
import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

// Secure cookies everywhere except the dev server (http localhost).
// import.meta.dev is the Nuxt-native signal — avoids reading process.env.
const isSecure = () => !import.meta.dev

/** Validate a token string against the auth service */
async function validateToken(token: string): Promise<string | null> {
  if (!token) return null
  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ user_id: string }>(`${config.authServiceUrl}/validate`, {
      headers: { authorization: `Bearer ${token}` }
    })
    return result.user_id ?? null
  }
  catch {
    return null
  }
}

/** Read cookie from H3 event or raw header (SSR internal fetch) */
function readCookie(event: H3Event, name: string): string | null {
  const fromH3 = getCookie(event, name)
  if (fromH3) return fromH3
  const raw = getHeader(event, 'cookie') ?? ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1] ?? null
}

// On SSR an inner /api fetch reuses a forward of the outer request's cookie
// header. After a refresh we rewrite THIS request's cookie header so those
// inner fetches carry the fresh pair. This replaces a former module-level
// `ssrRefreshedToken` bridge, which under concurrent renders could leak one
// user's refreshed token into another's. Request-scoped: only this event.
function forwardRefreshedCookies(event: H3Event, accessToken: string, refreshToken: string) {
  const req = event.node?.req
  if (!req) return
  const others = (getHeader(event, 'cookie') ?? '')
    .split(/;\s*/)
    .filter(Boolean)
    .filter(pair => !pair.startsWith('rb_access=') && !pair.startsWith('rb_refresh='))
  req.headers.cookie = [...others, `rb_access=${accessToken}`, `rb_refresh=${refreshToken}`].join('; ')
}

/**
 * Authenticate the request. Checks access token first, then tries refresh.
 * Sets event.context.user and event.context.accessToken on success.
 */
export async function authenticate(event: H3Event): Promise<AuthUser | null> {
  // Already authenticated (e.g. by a previous middleware run)
  if (event.context.user) return event.context.user as AuthUser

  // Access token: a Bearer header (MCP clients) else the rb_access cookie.
  // On SSR the inner /api fetches inherit a forward of this request's cookie
  // header; the refresh path below rewrites that header in place, so inner
  // calls read the fresh token straight from the cookie — no shared
  // cross-request state needed.
  const header = getHeader(event, 'authorization')
  const accessToken = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : (readCookie(event, 'rb_access') ?? '')

  const userId = await validateToken(accessToken)
  if (userId) {
    const user: AuthUser = { id: userId }
    event.context.user = user
    event.context.accessToken = accessToken
    return user
  }

  // 2. Try refresh token
  const refreshToken = readCookie(event, 'rb_refresh')
  if (!refreshToken) return null

  try {
    const config = useRuntimeConfig()
    const result = await $fetch<{ access_token: string, refresh_token: string }>(
      `${config.authServiceUrl}/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } }
    )

    setAuthCookies(event, result.access_token, result.refresh_token)
    // Rewrite this request's cookie header so SSR inner fetches forward the
    // fresh pair instead of the stale (rotated-away) one the browser sent.
    forwardRefreshedCookies(event, result.access_token, result.refresh_token)

    const newUserId = await validateToken(result.access_token)
    if (!newUserId) return null

    const user: AuthUser = { id: newUserId }
    event.context.user = user
    event.context.accessToken = result.access_token
    return user
  }
  catch {
    return null
  }
}

/** Require authenticated user or throw 401 */
export function requireAuthUser(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | undefined
  if (!user) throw new Unauthorized()
  return user
}

export function setAuthCookies(event: H3Event, accessToken: string, refreshToken: string) {
  const secure = isSecure()
  setCookie(event, 'rb_access', accessToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/'
  })
  setCookie(event, 'rb_refresh', refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 7
  })
}

export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, 'rb_access', { path: '/' })
  deleteCookie(event, 'rb_refresh', { path: '/' })
}
