import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'

// Mock the Prisma singleton before importing the service. Both the
// service and server/utils/notes pull getPrisma from server/utils/db,
// so this one mock covers every query path.
const note = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
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
  note.findMany.mockReset()
  note.update.mockReset()
  note.count.mockReset()
})

describe('createNote', () => {
  it('stamps the creator and collapses empty folder/description to null', async () => {
    note.create.mockResolvedValue({ id: 'n1' })
    await createNote(eventWith({ id: 'u1' }), {
      title: 'Hello',
      content: 'body',
      folder: '',
      description: null,
      visibility: 'PUBLIC'
    })
    expect(note.create).toHaveBeenCalledWith({
      data: {
        user_id: 'u1',
        title: 'Hello',
        content: 'body',
        folder: null,
        description: null,
        visibility: 'PUBLIC'
      }
    })
  })

  it('throws when the caller is unauthenticated', async () => {
    await expect(
      createNote(eventWith(), { title: 'x', content: '', folder: null, description: null, visibility: 'PROTECTED' })
    ).rejects.toBeInstanceOf(Unauthorized)
    expect(note.create).not.toHaveBeenCalled()
  })
})

describe('updateNote', () => {
  it('writes only the provided keys', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNote(eventWith({ id: 'u1' }), 'n1', { title: 'New title' })
    expect(note.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { title: 'New title' }
    })
  })

  it('collapses an empty folder to null when provided', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNote(eventWith({ id: 'u1' }), 'n1', { folder: '' })
    expect(note.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { folder: null }
    })
  })

  it('throws 404 when the note is missing or deleted', async () => {
    note.findFirst.mockResolvedValue(null)
    await expect(updateNote(eventWith({ id: 'u1' }), 'gone', { title: 'x' }))
      .rejects.toBeInstanceOf(NoteNotFound)
    expect(note.update).not.toHaveBeenCalled()
  })
})

describe('deleteNote', () => {
  it('soft-deletes and returns the id', async () => {
    note.findFirst.mockResolvedValue({ id: 'n1' })
    note.update.mockResolvedValue({ id: 'n1' })
    const result = await deleteNote(eventWith({ id: 'u1' }), 'n1')
    expect(note.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { is_deleted: true } })
    expect(result).toEqual({ deleted: 'n1' })
  })

  it('throws 404 when the note is missing', async () => {
    note.findFirst.mockResolvedValue(null)
    await expect(deleteNote(eventWith({ id: 'u1' }), 'gone')).rejects.toBeInstanceOf(NoteNotFound)
  })
})

describe('listNotes', () => {
  it('applies pagination and returns items + total', async () => {
    note.findMany.mockResolvedValue([{ id: 'n1' }])
    note.count.mockResolvedValue(1)
    const result = await listNotes(eventWith({ id: 'u1' }), { search: '', folder: '', limit: 20, offset: 0 })
    expect(result).toEqual({ items: [{ id: 'n1' }], total: 1 })
    expect(note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20, orderBy: { updated_at: 'desc' } })
    )
  })
})
