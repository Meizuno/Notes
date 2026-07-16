import { getCookie, getHeader, setCookie, deleteCookie } from 'h3'
import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

export type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
  picture?: string | null
}

// The auth service issues these cookies on COOKIE_DOMAIN (e.g. .meizuno.com),
// so one sign-in is valid across every *.meizuno.com app. We read the SAME
// names it sets, and only re-set them (with the same attributes) when we
// rotate the pair on refresh. access_token is readable (SPAs may Bearer it),
// refresh_token is httpOnly — mirroring the auth service exactly.
const ACCESS_COOKIE = 'access_token'
const REFRESH_COOKIE = 'refresh_token'
const ACCESS_MAX_AGE = 60 * 15
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7

// Secure cookies everywhere except the dev server (http localhost).
// import.meta.dev is the Nuxt-native signal — avoids reading process.env.
const isSecure = () => !import.meta.dev

// Parent domain the cookies are scoped to (NUXT_COOKIE_DOMAIN, e.g.
// `.meizuno.com`). Empty in dev → host-only cookies on localhost.
function cookieDomain(): string | undefined {
  return (useRuntimeConfig().cookieDomain as string) || undefined
}

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
    .filter(pair => !pair.startsWith(`${ACCESS_COOKIE}=`) && !pair.startsWith(`${REFRESH_COOKIE}=`))
  req.headers.cookie = [...others, `${ACCESS_COOKIE}=${accessToken}`, `${REFRESH_COOKIE}=${refreshToken}`].join('; ')
}

// The auth service rotates the refresh token into its /refresh Set-Cookie
// response (never the body, by design). Read the rotated value from there so
// the server-side refresh can re-issue it to the browser.
function rotatedRefresh(headers: Headers): string {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const cookies = typeof getter === 'function' ? getter.call(headers) : []
  for (const c of cookies) {
    const m = c.match(new RegExp(`^\\s*${REFRESH_COOKIE}=([^;]*)`))
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return ''
}

// Single-flight refresh. Refresh tokens are single-use — the auth service
// rotates them and treats a 2nd use of the same token as reuse, revoking the
// whole family (a surprise logout + 401). Parallel requests that all hit an
// expired access token must therefore share ONE /refresh call, keyed by the
// refresh token, rather than each POSTing it. (forwardRefreshedCookies only
// dedups a single render's inner SSR fetches; this covers separate concurrent
// requests on the same instance.) Map<old refresh token, in-flight>.
type RefreshResult = { access: string, refresh: string } | null
const inflightRefresh = new Map<string, Promise<RefreshResult>>()

async function refreshPair(authServiceUrl: string, refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await $fetch.raw<{ access_token: string }>(
      `${authServiceUrl}/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } }
    )
    const access = res._data?.access_token ?? ''
    const refresh = rotatedRefresh(res.headers)
    return access && refresh ? { access, refresh } : null
  }
  catch {
    return null
  }
}

function coalescedRefresh(authServiceUrl: string, refreshToken: string): Promise<RefreshResult> {
  let inflight = inflightRefresh.get(refreshToken)
  if (!inflight) {
    inflight = refreshPair(authServiceUrl, refreshToken)
    inflightRefresh.set(refreshToken, inflight)
    void inflight.finally(() => inflightRefresh.delete(refreshToken))
  }
  return inflight
}

/**
 * Authenticate the request. Checks access token first, then tries refresh.
 * Sets event.context.user and event.context.accessToken on success.
 */
export async function authenticate(event: H3Event): Promise<AuthUser | null> {
  // Already authenticated (e.g. by a previous middleware run)
  if (event.context.user) return event.context.user as AuthUser

  // Access token: a Bearer header (MCP clients) else the shared access cookie.
  // On SSR the inner /api fetches inherit a forward of this request's cookie
  // header; the refresh path below rewrites that header in place, so inner
  // calls read the fresh token straight from the cookie — no shared
  // cross-request state needed.
  const header = getHeader(event, 'authorization')
  const accessToken = header?.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : (readCookie(event, ACCESS_COOKIE) ?? '')

  const userId = await validateToken(accessToken)
  if (userId) {
    const user: AuthUser = { id: userId }
    event.context.user = user
    event.context.accessToken = accessToken
    return user
  }

  // 2. Try refresh token — coalesced so concurrent requests don't each
  // POST /refresh with the same single-use token (see coalescedRefresh).
  const refreshToken = readCookie(event, REFRESH_COOKIE)
  if (!refreshToken) return null

  const config = useRuntimeConfig()
  const pair = await coalescedRefresh(config.authServiceUrl, refreshToken)
  if (!pair) return null

  setAuthCookies(event, pair.access, pair.refresh)
  // Rewrite this request's cookie header so SSR inner fetches forward the
  // fresh pair instead of the stale (rotated-away) one the browser sent.
  forwardRefreshedCookies(event, pair.access, pair.refresh)

  const newUserId = await validateToken(pair.access)
  if (!newUserId) return null

  const user: AuthUser = { id: newUserId }
  event.context.user = user
  event.context.accessToken = pair.access
  return user
}

/** Require authenticated user or throw 401 */
export function requireAuthUser(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | undefined
  if (!user) throw new Unauthorized()
  return user
}

/**
 * The viewer's user id for visibility scoping, or null for anonymous.
 * Bridges the HTTP transport (event.context.user) to the viewer-id the
 * note data-access functions expect.
 */
export function viewerId(event: H3Event): string | null {
  return (event.context.user as AuthUser | undefined)?.id ?? null
}

// Re-set the shared cookies after a rotation. Attributes mirror the auth
// service so whichever side last writes them, the cookie stays identical.
export function setAuthCookies(event: H3Event, accessToken: string, refreshToken: string) {
  const secure = isSecure()
  const domain = cookieDomain()
  setCookie(event, ACCESS_COOKIE, accessToken, {
    httpOnly: false, sameSite: 'lax', secure, path: '/', domain, maxAge: ACCESS_MAX_AGE
  })
  setCookie(event, REFRESH_COOKIE, refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', domain, maxAge: REFRESH_MAX_AGE
  })
}

export function clearAuthCookies(event: H3Event) {
  const domain = cookieDomain()
  deleteCookie(event, ACCESS_COOKIE, { path: '/', domain })
  deleteCookie(event, REFRESH_COOKIE, { path: '/', domain })
}
