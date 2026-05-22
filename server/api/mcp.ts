import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getHeader } from 'h3'
import { registerNoteTools } from '../utils/mcp/notes'

// MCP endpoint exposing read + write access to the notes vault for
// ai-chat (and any other MCP client). Two auth paths:
//   - Trusted service: x-api-key matches NUXT_MCP_API_KEY plus an
//     x-user-id header → bypass session auth, use the header user.
//   - Browser session: fall through to the standard cookie-based
//     `requireAuthUser`, so the same URL works for direct access.
// Every tool runs in the context of `userId` — the creator stamp on
// create_note, and the boundary that keeps a user's PRIVATE notes
// invisible to other users on read/update.

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = getHeader(event, 'x-api-key')
  const headerUserId = getHeader(event, 'x-user-id')

  let userId: string
  if (config.mcpApiKey && apiKey === config.mcpApiKey && headerUserId) {
    // Trusted service call — skip session auth.
    userId = headerUserId
  }
  else {
    const user = requireAuthUser(event)
    userId = user.id
  }

  const db = getPrisma()
  const server = new McpServer({ name: 'notes', version: '1.0.0' })

  registerNoteTools(server, db, userId)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)

  const body = event.node.req.method === 'POST' ? await readBody(event) : undefined
  await transport.handleRequest(event.node.req, event.node.res, body)
})
