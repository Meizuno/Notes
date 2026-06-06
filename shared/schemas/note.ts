import { z } from 'zod'

// Single source of truth for Note request shapes + the visibility tier,
// shared across client (`#shared/schemas/note`) and server. Types are
// inferred from these schemas — do not redeclare them by hand.

// Visibility tier. These literals MUST stay in sync with the Prisma
// `NoteVisibility` enum (prisma/schema.prisma). We use a plain z.enum
// rather than z.nativeEnum(NoteVisibility) on purpose: this module is
// auto-imported on the client too, and importing @prisma/client there
// would drag the Prisma runtime into the browser bundle.
export const VISIBILITY_VALUES = ['PRIVATE', 'PROTECTED', 'PUBLIC'] as const
export const visibilitySchema = z.enum(VISIBILITY_VALUES)
export type Visibility = z.infer<typeof visibilitySchema>

// Optional free-text field (folder / description). Trimmed and length-
// capped; empty/whitespace and absence are both allowed. Collapsing an
// empty value to `null` is business logic and lives in the service.
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

// Create — POST /api/notes. Title required; the rest carry the
// create-time defaults the old handler applied inline.
export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  content: z.string().default(''),
  folder: optionalText(500),
  description: optionalText(500),
  visibility: visibilitySchema.default('PROTECTED')
})
export type CreateNoteInput = z.infer<typeof createNoteSchema>

// Update — PUT /api/notes/[id]. Every field optional: only the keys
// present in the body are written, so omission means "leave unchanged".
export const updateNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300).optional(),
  content: z.string().optional(),
  folder: optionalText(500),
  description: optionalText(500),
  visibility: visibilitySchema.optional()
})
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>

// List query — GET /api/notes. Query values arrive as strings, so the
// numeric fields coerce. Defaults mirror the old handler.
export const listNotesQuerySchema = z.object({
  search: z.string().trim().default(''),
  folder: z.string().trim().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>

// Note as serialized to the client (the read projection over the wire).
// `updated_at` is an ISO string here — Prisma's Date is JSON-serialized
// by the time it reaches a component.
export type Note = {
  id: string
  title: string
  folder: string | null
  description: string | null
  content: string
  visibility: Visibility
  updated_at: string
}
