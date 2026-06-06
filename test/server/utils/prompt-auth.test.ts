import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { promptViewerId } from '../../../server/utils/prompt-auth'

// Session path needs no useRuntimeConfig (checked first), so it's unit-
// testable without a Nuxt context. The API-key path (x-user-id → that user,
// else PUBLIC/null) reads useRuntimeConfig() — a Nuxt auto-import that needs
// the `nuxt` test environment to mock — so it's left to typecheck + the
// shared-helper scoping tests rather than mocked here.
function sessionEvent(user?: { id: string }): H3Event {
  return { context: { user } } as unknown as H3Event
}

describe('promptViewerId', () => {
  it('scopes a browser session to the logged-in user (prompts privacy regression)', () => {
    // viewer = A; loadNoteScoped/listNotesScoped then exclude other users'
    // PRIVATE notes (see notes.test.ts), so A cannot read B's private note
    // through /api/prompts/notes.
    expect(promptViewerId(sessionEvent({ id: 'user-A' }))).toBe('user-A')
  })
})
