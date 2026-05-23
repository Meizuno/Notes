import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PrismaClient } from '@prisma/client'
import { NoteVisibility } from '@prisma/client'
import { z } from 'zod/v3'
import { toJson } from './helpers'

// MCP tools for the shared notes vault. The MCP endpoint requires
// auth (session cookie or trusted-service API key + x-user-id), so
// every tool here runs in the context of a specific user — `userId`
// is the creator stamp on create, and is the boundary used to
// preserve PRIVATE-tier isolation on update.
//
// Tools:
//   list_notes   — search / list with snippets and metadata
//   get_note     — full markdown content for a single id
//   create_note  — create a new note (returns id + metadata)
//   update_note  — partial update by id (any provided field is set)
//   delete_note  — soft-delete by id (sets is_deleted=true; recoverable)

const visibilitySchema = z.enum(['PRIVATE', 'PROTECTED', 'PUBLIC'])
  .describe('Visibility tier. PRIVATE: only the creator can read. PROTECTED: any signed-in user can read (default). PUBLIC: anyone with the URL can read.')

// PRIVATE notes are owner-only; PROTECTED / PUBLIC are shared. This
// where-fragment lets a user see (and update) every shared note plus
// their own PRIVATE notes, mirroring the read filter used by the
// HTTP endpoints.
function visibilityScopeFor(userId: string) {
  return {
    is_deleted: false,
    OR: [
      { visibility: { not: NoteVisibility.PRIVATE } },
      { visibility: NoteVisibility.PRIVATE, user_id: userId }
    ]
  }
}

export function registerNoteTools(server: McpServer, db: PrismaClient, userId: string) {
  server.registerTool(
    'list_notes',
    {
      description: 'List or search notes in the vault. Optional `query` matches against title and content (case-insensitive substring, trigram-indexed); optional `folder` is a slash-separated prefix that also includes nested folders (e.g. "Programming" matches notes in "Programming/Rust"). Returns items (id, title, folder, hasContent, updatedAt, visibility, and snippet when a query matched the content), total count, and hasMore flag. Use get_note for full content. Default limit is 20.',
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
        ...visibilityScopeFor(userId),
        ...(query ? {
          AND: [{
            OR: [
              { title:   { contains: query, mode: 'insensitive' as const } },
              { content: { contains: query, mode: 'insensitive' as const } }
            ]
          }]
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
            visibility: true,
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
          visibility: n.visibility,
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
      description: 'Get full note by id. Returns title, description, content (CommonMark + GFM markdown), folder path, visibility tier, and timestamps. Returns an error if the id is not found or refers to a PRIVATE note owned by another user.',
      inputSchema: z.object({
        id: z.string().describe('(required) Note UUID.')
      })
    },
    async ({ id }) => {
      const note = await db.note.findFirst({
        where: { id, ...visibilityScopeFor(userId) },
        select: {
          id: true,
          title: true,
          description: true,
          content: true,
          folder: true,
          visibility: true,
          created_at: true,
          updated_at: true
        }
      })
      if (!note) return toJson({ error: 'Note not found' })
      return toJson(note)
    }
  )

  server.registerTool(
    'create_note',
    {
      description: 'Create a new note. `title` is required. `content` is CommonMark + GFM markdown. `description` is an optional one- or two-sentence summary (max 500 chars). `folder` is a slash-separated path that nests folders implicitly (e.g. "Programming/Rust"); omit for a root-level note. `visibility` defaults to PROTECTED. Returns the new note\'s id and metadata.',
      inputSchema: z.object({
        title: z.string().min(1).describe('(required) Note title.'),
        content: z.string().optional().describe('Markdown body. Omit for an empty note.'),
        description: z.string().max(500).optional().describe('Short summary surfaced in list / search contexts.'),
        folder: z.string().optional().describe('Folder path, slash-separated (e.g. "Programming/Rust"). Omit for root.'),
        visibility: visibilitySchema.optional()
      })
    },
    async ({ title, content, description, folder, visibility }) => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return toJson({ error: 'Title is required' })

      const note = await db.note.create({
        data: {
          user_id: userId,
          title: trimmedTitle,
          content: content ?? '',
          description: description?.trim() || null,
          folder: folder?.trim() || null,
          visibility: visibility ?? NoteVisibility.PROTECTED
        },
        select: {
          id: true,
          title: true,
          description: true,
          folder: true,
          visibility: true,
          created_at: true,
          updated_at: true
        }
      })
      return toJson(note)
    }
  )

  server.registerTool(
    'update_note',
    {
      description: 'Update a note by id. Any provided field is set; omitted fields are left unchanged. Pass `folder: null` or `description: null` to clear those fields. Returns the updated note. Errors if the id is not found, soft-deleted, or refers to a PRIVATE note owned by another user.',
      inputSchema: z.object({
        id: z.string().describe('(required) Note UUID.'),
        title: z.string().min(1).optional().describe('New title.'),
        content: z.string().optional().describe('New markdown body (replaces existing content).'),
        description: z.string().max(500).nullable().optional().describe('New summary, or null to clear.'),
        folder: z.string().nullable().optional().describe('New folder path, or null to move to root.'),
        visibility: visibilitySchema.optional()
      })
    },
    async ({ id, title, content, description, folder, visibility }) => {
      // Scope check up front so a hit on someone else's PRIVATE note
      // returns the same "not found" shape as a missing id, instead
      // of leaking existence via a different error.
      const existing = await db.note.findFirst({
        where: { id, ...visibilityScopeFor(userId) },
        select: { id: true }
      })
      if (!existing) return toJson({ error: 'Note not found' })

      const updated = await db.note.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(folder !== undefined ? { folder: folder?.trim() || null } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          ...(visibility !== undefined ? { visibility } : {})
        },
        select: {
          id: true,
          title: true,
          description: true,
          folder: true,
          visibility: true,
          updated_at: true
        }
      })
      return toJson(updated)
    }
  )

  server.registerTool(
    'delete_note',
    {
      description: 'Soft-delete a note by id. The row stays in the database with is_deleted=true and disappears from every read endpoint, but can be recovered manually if needed. Errors if the id is not found, already deleted, or refers to a PRIVATE note owned by another user.',
      inputSchema: z.object({
        id: z.string().describe('(required) Note UUID.')
      })
    },
    async ({ id }) => {
      // Same scope check as update_note — collapsing "not yours" into
      // "not found" keeps existence of other users' PRIVATE notes
      // from leaking via the error shape.
      const existing = await db.note.findFirst({
        where: { id, ...visibilityScopeFor(userId) },
        select: { id: true }
      })
      if (!existing) return toJson({ error: 'Note not found' })

      await db.note.update({ where: { id }, data: { is_deleted: true } })
      return toJson({ deleted: id })
    }
  )
}
