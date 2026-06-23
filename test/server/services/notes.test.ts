import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'
import { Prisma } from '@prisma/client'

// Mock the Prisma singleton (shared by the service and the data-access
// layer it delegates to).
const note = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn()
}
vi.mock('../../../server/utils/db', () => ({ getPrisma: () => ({ note }) }))

const { createNote, updateNote, deleteNote, listNotes } = await import('../../../server/services/notes')
const { NoteNotFound, Unauthorized } = await import('../../../server/utils/errors')

function eventWith(user?: { id: string }): H3Event {
  return { context: { user } } as unknown as H3Event
}

beforeEach(() => {
  note.create.mockReset()
  note.findFirst.mockReset()
  note.findUnique.mockReset()
  note.findMany.mockReset()
  note.update.mockReset()
  note.updateMany.mockReset()
  note.count.mockReset()
  // Default: slugs are free (uniqueNoteSlug's findUnique → null).
  note.findUnique.mockResolvedValue(null)
})

describe('createNote', () => {
  it('stamps the creator, collapses empty folder/description, and forces is_shared for PUBLIC', async () => {
    note.create.mockResolvedValue({ id: 'n1' })
    await createNote(eventWith({ id: 'u1' }), {
      title: 'Hello',
      content: 'body',
      folder: '',
      description: null,
      visibility: 'PUBLIC',
      // even though the client sent false, PUBLIC forces is_shared true
      is_shared: false
    })
    // (createNote also passes select: NOTE_SELECT to project the response;
    // assert on the data payload here.)
    expect(note.create.mock.calls[0][0].data).toEqual({
      user_id: 'u1',
      slug: 'hello',
      title: 'Hello',
      content: 'body',
      folder: null,
      description: null,
      visibility: 'PUBLIC',
      is_shared: true
    })
  })

  it('passes is_shared through for a non-public note', async () => {
    note.create.mockResolvedValue({ id: 'n1' })
    await createNote(eventWith({ id: 'u1' }), {
      title: 'Shared protected',
      content: '',
      folder: null,
      description: null,
      visibility: 'PROTECTED',
      is_shared: true
    })
    expect(note.create.mock.calls[0][0].data).toMatchObject({
      visibility: 'PROTECTED',
      is_shared: true
    })
  })

  it('throws Unauthorized when the caller is anonymous', async () => {
    await expect(
      createNote(eventWith(), { title: 'x', content: '', folder: null, description: null, visibility: 'PROTECTED', is_shared: false })
    ).rejects.toBeInstanceOf(Unauthorized)
    expect(note.create).not.toHaveBeenCalled()
  })
})

describe('updateNote', () => {
  it('requires a logged-in user', async () => {
    await expect(updateNote(eventWith(), 'n1', { title: 'x' })).rejects.toBeInstanceOf(Unauthorized)
    expect(note.update).not.toHaveBeenCalled()
  })

  it('resolves within the viewer scope then writes only the provided, trimmed keys', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNote(eventWith({ id: 'u1' }), 'my-note', { title: '  New  ', folder: '' })
    // The visibility scope rides on the resolve (findFirst); the update is
    // by the resolved id.
    expect(note.findFirst.mock.calls[0][0].where.OR).toBeTruthy()
    expect(note.update.mock.calls[0][0].where).toEqual({ id: 'n1' })
    expect(note.update.mock.calls[0][0].data).toEqual({ title: 'New', folder: null })
  })

  it('propagates NoteNotFound (Prisma P2025) from the scoped update', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2025',
      clientVersion: 'test'
    }))
    await expect(updateNote(eventWith({ id: 'u1' }), 'gone', { title: 'x' })).rejects.toBeInstanceOf(NoteNotFound)
  })
})

describe('deleteNote', () => {
  it('requires a logged-in user', async () => {
    await expect(deleteNote(eventWith(), 'n1')).rejects.toBeInstanceOf(Unauthorized)
    expect(note.updateMany).not.toHaveBeenCalled()
  })

  it('soft-deletes for the viewer and returns the id', async () => {
    note.updateMany.mockResolvedValue({ count: 1 })
    expect(await deleteNote(eventWith({ id: 'u1' }), 'n1')).toEqual({ deleted: 'n1' })
  })

  it('propagates NoteNotFound when nothing matched the scope', async () => {
    note.updateMany.mockResolvedValue({ count: 0 })
    await expect(deleteNote(eventWith({ id: 'u1' }), 'gone')).rejects.toBeInstanceOf(NoteNotFound)
  })
})

describe('listNotes', () => {
  it('scopes to the logged-in viewer (shared + own private)', async () => {
    note.findMany.mockResolvedValue([])
    note.count.mockResolvedValue(0)
    await listNotes(eventWith({ id: 'u1' }), { search: '', folder: '', limit: 20, offset: 0 })
    expect(note.findMany.mock.calls[0][0].where.OR).toEqual([
      { visibility: { not: 'PRIVATE' } },
      { visibility: 'PRIVATE', user_id: 'u1' }
    ])
  })

  it('scopes anonymous callers to PUBLIC only', async () => {
    note.findMany.mockResolvedValue([])
    note.count.mockResolvedValue(0)
    await listNotes(eventWith(), { search: '', folder: '', limit: 20, offset: 0 })
    expect(note.findMany.mock.calls[0][0].where).toMatchObject({ is_deleted: false, visibility: 'PUBLIC' })
  })
})
