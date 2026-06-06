import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'
import { Prisma } from '@prisma/client'

// Mock the Prisma singleton before importing the service. Both the
// service and server/utils/notes pull getPrisma from server/utils/db,
// so this one mock covers every query path.
const note = {
  create: vi.fn(),
  findFirst: vi.fn(),
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
  note.findMany.mockReset()
  note.update.mockReset()
  note.updateMany.mockReset()
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
  it('writes only the provided keys, with the existence filter in the where', async () => {
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNote(eventWith({ id: 'u1' }), 'n1', { title: 'New title' })
    expect(note.update).toHaveBeenCalledWith({
      where: { id: 'n1', is_deleted: false },
      data: { title: 'New title' }
    })
  })

  it('collapses an empty folder to null when provided', async () => {
    note.update.mockResolvedValue({ id: 'n1' })
    await updateNote(eventWith({ id: 'u1' }), 'n1', { folder: '' })
    expect(note.update).toHaveBeenCalledWith({
      where: { id: 'n1', is_deleted: false },
      data: { folder: null }
    })
  })

  it('translates Prisma P2025 (no matching row) into NoteNotFound', async () => {
    note.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: 'test'
      })
    )
    await expect(updateNote(eventWith({ id: 'u1' }), 'gone', { title: 'x' }))
      .rejects.toBeInstanceOf(NoteNotFound)
  })

  it('re-throws non-P2025 Prisma errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2002',
      clientVersion: 'test'
    })
    note.update.mockRejectedValue(other)
    await expect(updateNote(eventWith({ id: 'u1' }), 'n1', { title: 'x' })).rejects.toBe(other)
  })
})

describe('deleteNote', () => {
  it('soft-deletes via updateMany and returns the id', async () => {
    note.updateMany.mockResolvedValue({ count: 1 })
    const result = await deleteNote(eventWith({ id: 'u1' }), 'n1')
    expect(note.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', is_deleted: false },
      data: { is_deleted: true }
    })
    expect(result).toEqual({ deleted: 'n1' })
  })

  it('throws 404 when no row was affected', async () => {
    note.updateMany.mockResolvedValue({ count: 0 })
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
