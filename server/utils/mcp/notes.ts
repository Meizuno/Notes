import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod/v3'
import { toJson } from './helpers'

// MCP tools for the shared knowledge base. Read-only by design — the
// LLM should be able to surface what's in the vault but not silently
// mutate it. Writes happen through the UI.
//
// Tools:
//   list_notes — search / list with snippets and metadata
//   get_note   — full markdown content for a single id

export function registerNoteTools(server: McpServer, db: PrismaClient) {
  server.registerTool(
    'list_notes',
    {
      description: 'List or search notes in the knowledge base. Optional `query` matches against title and content (case-insensitive substring, trigram-indexed); optional `folder` is a slash-separated prefix that also includes nested folders (e.g. "Programming" matches notes in "Programming/Rust"). Returns items (id, title, folder, hasContent, updatedAt, and snippet when a query matched the content), total count, and hasMore flag. Use get_note for full content. Default limit is 20.',
      inputSchema: z.object({
        query: z.string().optional().describe('Keyword matched against title and content. Omit to list all notes.'),
        folder: z.string().optional().describe('Folder path prefix, e.g. "Programming" or "Programming/Rust". Includes notes in subfolders.'),
        limit: z.number().int().optional().describe('Max items to return (default 20, max 100).'),
        offset: z.number().int().optional().describe('Number of items to skip (default 0).')
      })
    },
    async ({ query, folder, limit, offset }) => {
      const take = Math.min(limit ?? 20, 100)
      const skip = offset ?? 0
      const where = {
        is_deleted: false,
        ...(query ? {
          OR: [
            { title:   { contains: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } }
          ]
        } : {}),
        ...(folder ? { folder: { startsWith: folder } } : {})
      }

      const [notes, total] = await Promise.all([
        db.note.findMany({
          where,
          select: {
            id: true,
            title: true,
            folder: true,
            content: true,
            updated_at: true
          },
          orderBy: { updated_at: 'desc' },
          take,
          skip
        }),
        db.note.count({ where })
      ])

      const makeSnippet = (content: string) => {
        if (!query) return null
        const idx = content.toLowerCase().indexOf(query.toLowerCase())
        if (idx < 0) return null
        const start = Math.max(0, idx - 40)
        const end = Math.min(content.length, idx + query.length + 40)
        return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
      }

      return toJson({
        items: notes.map(n => ({
          id: n.id,
          title: n.title,
          folder: n.folder,
          hasContent: n.content.length > 0,
          snippet: makeSnippet(n.content),
          updatedAt: n.updated_at
        })),
        total,
        hasMore: skip + notes.length < total
      })
    }
  )

  server.registerTool(
    'get_note',
    {
      description: 'Get full note by id. Returns title, content (markdown — may contain wiki-links like [[Other Note]]), folder path, and timestamps.',
      inputSchema: z.object({
        id: z.string().describe('(required) Note UUID.')
      })
    },
    async ({ id }) => {
      const note = await db.note.findFirst({
        where: { id, is_deleted: false },
        select: {
          id: true,
          title: true,
          content: true,
          folder: true,
          created_at: true,
          updated_at: true
        }
      })
      if (!note) return toJson({ error: 'Note not found' })
      return toJson(note)
    }
  )
}
