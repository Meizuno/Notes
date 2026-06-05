import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { noteVisibilityWhere, NoteVisibility } from '../../../server/utils/notes'

// Builds a minimal H3Event carrying only what noteVisibilityWhere
// reads: event.context.user.
function fakeEvent(user?: { id: string }): H3Event {
  return { context: { user } } as unknown as H3Event
}

describe('noteVisibilityWhere', () => {
  it('restricts anonymous callers to public, non-deleted notes', () => {
    const where = noteVisibilityWhere(fakeEvent())
    expect(where).toEqual({
      is_deleted: false,
      visibility: NoteVisibility.PUBLIC
    })
  })

  it('lets an authenticated caller see non-private notes and their own private ones', () => {
    const where = noteVisibilityWhere(fakeEvent({ id: 'user-1' }))
    expect(where).toEqual({
      is_deleted: false,
      OR: [
        { visibility: { not: NoteVisibility.PRIVATE } },
        { visibility: NoteVisibility.PRIVATE, user_id: 'user-1' }
      ]
    })
  })
})
