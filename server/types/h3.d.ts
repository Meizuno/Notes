import type {} from 'h3'

// Request-scoped values we attach to event.context, so downstream code
// reads them typed instead of as `any`.
declare module 'h3' {
  interface H3EventContext {
    requestId?: string
  }
}
