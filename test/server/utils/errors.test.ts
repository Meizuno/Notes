import { describe, it, expect } from 'vitest'
import { isError } from 'h3'
import { DomainError, NoteNotFound, Unauthorized } from '../../../server/utils/errors'

describe('domain errors', () => {
  it('NoteNotFound carries a 404 and the id in its message', () => {
    const err = new NoteNotFound('abc')
    expect(err.statusCode).toBe(404)
    expect(err.statusMessage).toBe('Note not found')
    expect(err.name).toBe('NoteNotFound')
    expect(err.message).toContain('abc')
    expect(err).toBeInstanceOf(DomainError)
  })

  it('Unauthorized carries a 401', () => {
    const err = new Unauthorized()
    expect(err.statusCode).toBe(401)
    expect(err.statusMessage).toBe('Unauthorized')
    expect(err.name).toBe('Unauthorized')
  })

  it('are recognized as H3 errors so Nitro renders the right status', () => {
    // isError keys off the H3Error brand; if this is false, Nitro would
    // treat the throw as an unhandled 500 instead of the carried status.
    expect(isError(new NoteNotFound())).toBe(true)
    expect(isError(new Unauthorized())).toBe(true)
  })
})
