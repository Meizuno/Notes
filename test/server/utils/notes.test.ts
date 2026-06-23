import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock the Prisma singleton; the shared data-access functions all pull
// getPrisma from server/utils/db.
const note = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn()
}
vi.mock('../../../server/utils/db', () => ({ getPrisma: () => ({ note }) }))

const {
  noteVisibilityWhere,
  noteByIdReadableWhere,
  noteKeyWhere,
  uniqueNoteSlug,
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
  note.findUnique.mockReset()
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

describe('noteByIdReadableWhere', () => {
  it('lets anonymous read PUBLIC or any is_shared note', () => {
    expect(noteByIdReadableWhere(null)).toEqual({
      is_deleted: false,
      OR: [
        { visibility: NoteVisibility.PUBLIC },
        { is_shared: true }
      ]
    })
  })

  it('adds the is_shared link escape to the viewer tier scope', () => {
    expect(noteByIdReadableWhere('user-1')).toEqual({
      is_deleted: false,
      OR: [
        { visibility: { not: NoteVisibility.PRIVATE } },
        { visibility: NoteVisibility.PRIVATE, user_id: 'user-1' },
        { is_shared: true }
      ]
    })
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

  it('writes is_shared when explicitly present', () => {
    expect(buildNoteUpdateData({ is_shared: true })).toEqual({ is_shared: true })
    expect(buildNoteUpdateData({ is_shared: false })).toEqual({ is_shared: false })
  })

  it('forces is_shared true on a visibility→PUBLIC change, even against a false flag', () => {
    expect(buildNoteUpdateData({ visibility: NoteVisibility.PUBLIC })).toEqual({
      visibility: NoteVisibility.PUBLIC,
      is_shared: true
    })
    expect(buildNoteUpdateData({ visibility: NoteVisibility.PUBLIC, is_shared: false })).toEqual({
      visibility: NoteVisibility.PUBLIC,
      is_shared: true
    })
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

describe('noteKeyWhere', () => {
  it('matches a normal slug by slug only (id is a UUID column → no cast)', () => {
    expect(noteKeyWhere('ddd-overview')).toEqual({ slug: 'ddd-overview' })
  })
  it('matches a UUID key by slug OR id (legacy links)', () => {
    const uuid = 'b5636819-edc4-491c-a492-a4719f332a2c'
    expect(noteKeyWhere(uuid)).toEqual({ OR: [{ slug: uuid }, { id: uuid }] })
  })
})

describe('uniqueNoteSlug', () => {
  it('returns the base slug when free', async () => {
    note.findUnique.mockResolvedValue(null)
    expect(await uniqueNoteSlug('DDD Overview')).toBe('ddd-overview')
  })
  it('appends -2, -3, … until a free slug is found', async () => {
    // base + base-2 taken, base-3 free.
    note.findUnique
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce({ id: 'b' })
      .mockResolvedValueOnce(null)
    expect(await uniqueNoteSlug('DDD Overview')).toBe('ddd-overview-3')
  })
  it('skips a reserved base slug so a note cannot shadow a top-level route', async () => {
    // 'New' → 'new' is reserved → falls through to 'new-2' without a DB hit.
    note.findUnique.mockResolvedValue(null)
    expect(await uniqueNoteSlug('New')).toBe('new-2')
  })
})

describe('loadNoteScoped', () => {
  it('resolves by slug-or-id within the viewer scope', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    await loadNoteScoped('u1', 'my-note')
    expect(note.findFirst.mock.calls[0][0].where).toEqual({
      ...noteVisibilityWhere('u1'),
      AND: [noteKeyWhere('my-note')]
    })
  })

  it('widens to the by-link readable scope with { includeShared: true }', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    await loadNoteScoped('u1', 'my-note', { includeShared: true })
    expect(note.findFirst.mock.calls[0][0].where).toEqual({
      ...noteByIdReadableWhere('u1'),
      AND: [noteKeyWhere('my-note')]
    })
  })
})

describe('updateNoteScoped', () => {
  it('resolves the note by slug-or-id within scope, then updates by id', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNoteScoped('u1', 'my-note', { title: 'x' })
    expect(note.findFirst.mock.calls[0][0].where).toEqual({
      ...noteVisibilityWhere('u1'),
      AND: [noteKeyWhere('my-note')]
    })
    expect(note.update.mock.calls[0][0].where).toEqual({ id: 'n1' })
  })
  it('throws NoteNotFound when nothing matched the scope', async () => {
    note.findFirst.mockResolvedValue(null)
    await expect(updateNoteScoped('u1', 'gone', { title: 'x' })).rejects.toBeInstanceOf(NoteNotFound)
    expect(note.update).not.toHaveBeenCalled()
  })
  it('maps Prisma P2025 to NoteNotFound', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test'
    }))
    await expect(updateNoteScoped('u1', 'n1', { title: 'x' })).rejects.toBeInstanceOf(NoteNotFound)
  })
  it('re-throws non-P2025 Prisma errors', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    const other = new Prisma.PrismaClientKnownRequestError('boom', { code: 'P2002', clientVersion: 'test' })
    note.update.mockRejectedValue(other)
    await expect(updateNoteScoped('u1', 'n1', {})).rejects.toBe(other)
  })
})

describe('softDeleteScoped', () => {
  it('soft-deletes within scope (slug-or-id) and returns the key', async () => {
    note.updateMany.mockResolvedValue({ count: 1 })
    const result = await softDeleteScoped('u1', 'my-note')
    expect(note.updateMany).toHaveBeenCalledWith({
      where: { ...noteVisibilityWhere('u1'), AND: [noteKeyWhere('my-note')] },
      data: { is_deleted: true }
    })
    expect(result).toEqual({ deleted: 'my-note' })
  })
  it('throws NoteNotFound when no row matched the scope', async () => {
    note.updateMany.mockResolvedValue({ count: 0 })
    await expect(softDeleteScoped('u1', 'gone')).rejects.toBeInstanceOf(NoteNotFound)
  })
})
