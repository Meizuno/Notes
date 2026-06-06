import { describe, it, expect } from 'vitest'
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
  visibilitySchema
} from '../../../shared/schemas/note'

describe('createNoteSchema', () => {
  it('fills defaults and trims the title', () => {
    const parsed = createNoteSchema.parse({ title: '  Hello  ' })
    expect(parsed).toMatchObject({
      title: 'Hello',
      content: '',
      visibility: 'PROTECTED'
    })
  })

  it('rejects an empty / whitespace-only title', () => {
    expect(createNoteSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(createNoteSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a title over 300 chars and an unknown visibility', () => {
    expect(createNoteSchema.safeParse({ title: 'a'.repeat(301) }).success).toBe(false)
    expect(createNoteSchema.safeParse({ title: 'ok', visibility: 'SECRET' }).success).toBe(false)
  })
})

describe('updateNoteSchema', () => {
  it('accepts an empty object (nothing to change)', () => {
    expect(updateNoteSchema.parse({})).toEqual({})
  })

  it('keeps only the provided keys (omission means unchanged)', () => {
    const parsed = updateNoteSchema.parse({ folder: ' work ' })
    expect(parsed).toEqual({ folder: 'work' })
    expect('title' in parsed).toBe(false)
  })

  it('allows folder to be set to null explicitly', () => {
    expect(updateNoteSchema.parse({ folder: null })).toEqual({ folder: null })
  })
})

describe('listNotesQuerySchema', () => {
  it('applies defaults when the query is empty', () => {
    expect(listNotesQuerySchema.parse({})).toEqual({
      search: '',
      folder: '',
      limit: 20,
      offset: 0
    })
  })

  it('coerces numeric strings and caps the limit', () => {
    const parsed = listNotesQuerySchema.parse({ limit: '50', offset: '10' })
    expect(parsed.limit).toBe(50)
    expect(parsed.offset).toBe(10)
    expect(listNotesQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
  })
})

describe('visibilitySchema', () => {
  it('accepts the three known tiers and rejects others', () => {
    expect(visibilitySchema.parse('PUBLIC')).toBe('PUBLIC')
    expect(visibilitySchema.safeParse('public').success).toBe(false)
  })
})
