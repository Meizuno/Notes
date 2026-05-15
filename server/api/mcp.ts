import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getHeader } from 'h3'
import { registerNoteTools } from '../utils/mcp/notes'

// MCP endpoint exposing read-only access to the notes vault for
// ai-chat (and any other MCP client). Two auth paths:
//   - Trusted service: x-api-key matches NUXT_MCP_API_KEY plus an
//     x-user-id header → bypass session auth.
//   - Browser session: fall through to the standard cookie-based
//     `requireAuthUser`, so the same URL works for direct access.

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = getHeader(event, 'x-api-key')
  const headerUserId = getHeader(event, 'x-user-id')

  if (config.mcpApiKey && apiKey === config.mcpApiKey && headerUserId) {
    // Trusted service call — skip session auth.
  }
  else {
    requireAuthUser(event)
  }

  const db = getPrisma()
  const server = new McpServer({ name: 'notes', version: '1.0.0' })

  registerNoteTools(server, db)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)

  const body = event.node.req.method === 'POST' ? await readBody(event) : undefined
  await transport.handleRequest(event.node.req, event.node.res, body)
})
