import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { registerNoteTools } from '../utils/mcp/notes'

// MCP endpoint exposing read + write access to the notes vault for ai-chat
// (and any other MCP client). The middleware has already resolved the
// principal from the Bearer token (ai-chat sends the user's access token) or
// the session cookie (browser), so every tool runs in the context of that
// REAL user — never a caller-asserted x-user-id. `userId` is the creator
// stamp on create_note and the boundary that keeps a user's PRIVATE notes
// invisible to other users on read/update.

export default defineEventHandler(async (event) => {
  const userId = requireAuthUser(event).id

  const db = getPrisma()
  const server = new McpServer({ name: 'notes', version: '1.0.0' })

  registerNoteTools(server, db, userId)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)

  const body = event.node.req.method === 'POST' ? await readBody(event) : undefined
  await transport.handleRequest(event.node.req, event.node.res, body)
})
