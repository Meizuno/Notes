import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { Unauthorized } from './errors'

/**
 * Authenticate a prompt request and return the viewer id used to scope note
 * visibility (null = anonymous → PUBLIC only). Throws Unauthorized if the
 * request is neither a valid API-key call nor a logged-in session.
 *
 * Two paths:
 *   - Trusted service (ai-chat) presents x-api-key. There is no inherent
 *     user identity, so we scope to an x-user-id header when supplied (same
 *     mechanism as the MCP endpoint), and otherwise to PUBLIC only — the
 *     API key never exposes another user's PRIVATE/PROTECTED notes.
 *   - Browser session: scope to the logged-in user.
 */
export function promptViewerId(event: H3Event): string | null {
  // Browser session takes precedence — scope to the logged-in user.
  const user = event.context.user as { id: string } | undefined
  if (user) return user.id

  // Otherwise a trusted-service API-key call: scope to a supplied x-user-id,
  // else PUBLIC only (null). The key alone never exposes private notes.
  const config = useRuntimeConfig()
  if (config.mcpApiKey && getHeader(event, 'x-api-key') === config.mcpApiKey) {
    return getHeader(event, 'x-user-id') || null
  }

  throw new Unauthorized()
}
