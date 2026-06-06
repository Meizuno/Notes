import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PrismaClient } from '@prisma/client'
import { NoteVisibility } from '@prisma/client'
import { z } from 'zod/v3'
import { toJson } from './helpers'
import { NoteNotFound } from '../errors'
import {
  buildNoteUpdateData,
  listNotesScoped,
  loadNoteScoped,
  makeNoteSnippet,
  softDeleteScoped,
  updateNoteScoped
} from '../notes'

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

// Visibility scoping + atomic scoped CRUD live in ../notes (shared with the
// HTTP services and the prompt endpoints); these tools pass the MCP `userId`
// as the viewer. `db` is still used directly for create_note.
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
      const limitN = Math.min(limit ?? 20, 100)
      const offsetN = offset ?? 0
      const { items, total } = await listNotesScoped(userId, {
        search: query,
        folder,
        limit: limitN,
        offset: offsetN
      })

      return toJson({
        items: items.map(n => ({
          id: n.id,
          title: n.title,
          folder: n.folder,
          visibility: n.visibility,
          hasContent: n.content.length > 0,
          snippet: makeNoteSnippet(n.content, query),
          updatedAt: n.updated_at
        })),
        total,
        hasMore: offsetN + items.length < total
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
      const note = await loadNoteScoped(userId, id)
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
      // updateNoteScoped carries the existence + visibility filter in the
      // where clause (atomic, no read-then-write) and throws NoteNotFound
      // when no row matches — including a hit on someone else's PRIVATE
      // note, which collapses to the same "not found" shape as a missing id.
      try {
        const updated = await updateNoteScoped(
          userId,
          id,
          buildNoteUpdateData({ title, content, description, folder, visibility })
        )
        return toJson({
          id: updated.id,
          title: updated.title,
          description: updated.description,
          folder: updated.folder,
          visibility: updated.visibility,
          updated_at: updated.updated_at
        })
      }
      catch (err) {
        // MCP returns tool-result JSON, not HTTP errors — translate the
        // domain not-found into the tool's "not found" shape.
        if (err instanceof NoteNotFound) return toJson({ error: 'Note not found' })
        throw err
      }
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
      // softDeleteScoped applies the same visibility scope and reports a
      // zero affected-row count as not-found — so "not yours" collapses to
      // "not found" without a separate read.
      try {
        return toJson(await softDeleteScoped(userId, id))
      }
      catch (err) {
        if (err instanceof NoteNotFound) return toJson({ error: 'Note not found' })
        throw err
      }
    }
  )
}
