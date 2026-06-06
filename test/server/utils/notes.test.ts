import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock the Prisma singleton; the shared data-access functions all pull
// getPrisma from server/utils/db.
const note = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn()
}
vi.mock('../../../server/utils/db', () => ({ getPrisma: () => ({ note }) }))

const {
  noteVisibilityWhere,
  makeNoteSnippet,
  buildNoteUpdateData,
  listNotesScoped,
  loadNoteScoped,
  updateNoteScoped,
  softDeleteScoped,
  NoteVisibility
} = await import('../../../server/utils/notes')
const { NoteNotFound } = await import('../../../server/utils/errors')

beforeEach(() => {
  note.findFirst.mockReset()
  note.findMany.mockReset()
  note.update.mockReset()
  note.updateMany.mockReset()
  note.count.mockReset()
})

describe('noteVisibilityWhere', () => {
  it('restricts anonymous (null) viewers to public, non-deleted notes', () => {
    expect(noteVisibilityWhere(null)).toEqual({
      is_deleted: false,
      visibility: NoteVisibility.PUBLIC
    })
  })

  it('lets a viewer see shared notes plus only their OWN private notes', () => {
    expect(noteVisibilityWhere('user-1')).toEqual({
      is_deleted: false,
      OR: [
        { visibility: { not: NoteVisibility.PRIVATE } },
        { visibility: NoteVisibility.PRIVATE, user_id: 'user-1' }
      ]
    })
    // The private branch is keyed to user-1, so another user's PRIVATE
    // note can never match — the core cross-user isolation guarantee.
  })
})

describe('makeNoteSnippet', () => {
  it('returns null for empty content', () => {
    expect(makeNoteSnippet('')).toBeNull()
  })
  it('windows around the first search match', () => {
    expect(makeNoteSnippet('hello WORLD foo', 'world')).toContain('WORLD')
  })
  it('falls back to a leading slice with no/!matching search', () => {
    expect(makeNoteSnippet('abc')).toBe('abc')
  })
})

describe('buildNoteUpdateData', () => {
  it('writes only present keys; trims title; collapses empty folder/description to null', () => {
    expect(buildNoteUpdateData({ title: '  New  ', folder: '', description: '  ' })).toEqual({
      title: 'New',
      folder: null,
      description: null
    })
    expect(buildNoteUpdateData({})).toEqual({})
  })
})

describe('listNotesScoped', () => {
  it('applies the visibility scope and AND-wraps search so it cannot clobber the visibility OR', async () => {
    note.findMany.mockResolvedValue([])
    note.count.mockResolvedValue(0)
    await listNotesScoped('u1', { search: 'foo', folder: 'F', limit: 20, offset: 5 })
    const arg = note.findMany.mock.calls[0][0]
    expect(arg.where.OR).toEqual([
      { visibility: { not: NoteVisibility.PRIVATE } },
      { visibility: NoteVisibility.PRIVATE, user_id: 'u1' }
    ])
    expect(arg.where.AND).toEqual([{
      OR: [
        { title: { contains: 'foo', mode: 'insensitive' } },
        { content: { contains: 'foo', mode: 'insensitive' } }
      ]
    }])
    expect(arg.where.folder).toEqual({ startsWith: 'F' })
    expect(arg.skip).toBe(5)
    expect(arg.take).toBe(20)
  })
})

describe('loadNoteScoped', () => {
  it('reads a single note within the viewer scope', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    await loadNoteScoped('u1', 'n1')
    expect(note.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', ...noteVisibilityWhere('u1') })
  })
})

describe('updateNoteScoped', () => {
  it('carries the viewer scope in the where clause', async () => {
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNoteScoped('u1', 'n1', { title: 'x' })
    expect(note.update.mock.calls[0][0].where).toEqual({ id: 'n1', ...noteVisibilityWhere('u1') })
  })
  it('maps Prisma P2025 to NoteNotFound', async () => {
    note.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test'
    }))
    await expect(updateNoteScoped('u1', 'gone', { title: 'x' })).rejects.toBeInstanceOf(NoteNotFound)
  })
  it('re-throws non-P2025 Prisma errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('boom', { code: 'P2002', clientVersion: 'test' })
    note.update.mockRejectedValue(other)
    await expect(updateNoteScoped('u1', 'n1', {})).rejects.toBe(other)
  })
})

describe('softDeleteScoped', () => {
  it('soft-deletes within scope and returns the id', async () => {
    note.updateMany.mockResolvedValue({ count: 1 })
    const result = await softDeleteScoped('u1', 'n1')
    expect(note.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', ...noteVisibilityWhere('u1') },
      data: { is_deleted: true }
    })
    expect(result).toEqual({ deleted: 'n1' })
  })
  it('throws NoteNotFound when no row matched the scope', async () => {
    note.updateMany.mockResolvedValue({ count: 0 })
    await expect(softDeleteScoped('u1', 'gone')).rejects.toBeInstanceOf(NoteNotFound)
  })
})
