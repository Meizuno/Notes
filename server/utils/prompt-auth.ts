import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

/**
 * Authenticate a prompt request and return the viewer id used to scope note
 * visibility. The middleware has already resolved the principal from the
 * Bearer token (ai-chat sends the user's access token) or the session cookie
 * (browser); we scope to that REAL user — never a caller-asserted x-user-id.
 * Throws Unauthorized when no valid principal is present.
 */
export function promptViewerId(event: H3Event): string | null {
  const user = event.context.user as { id: string } | undefined
  if (user) return user.id
  throw new Unauthorized()
}
