import { getHeader, createError } from 'h3'
import type { H3Event } from 'h3'

/** Authenticate prompt request — API key (from ai-chat) or user session. */
export function verifyPromptAccess(event: H3Event): void {
  const config = useRuntimeConfig()
  const apiKey = getHeader(event, 'x-api-key')

  if (config.mcpApiKey && apiKey === config.mcpApiKey) return

  const user = event.context.user as { id: string } | undefined
  if (user) return

  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
