import { randomUUID } from 'node:crypto'
import { consola } from 'consola'

// Request logging. Stamps each request with a requestId (also returned
// as x-request-id for client/log correlation), puts it on
// event.context so downstream code can read it without threading it
// through signatures, and emits ONE single-line key=value record per
// completed request. The fields go in the message string, not as an
// object argument — consola's reporter pretty-prints an object across
// multiple lines, which log collectors then read as separate entries.
const log = consola.withTag('http')

export default defineEventHandler((event) => {
  const requestId = randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  const start = Date.now()
  event.node.res.on('finish', () => {
    log.info(
      `request method=${event.method} path=${event.path} status=${event.node.res.statusCode} durationMs=${Date.now() - start} requestId=${requestId}`
    )
  })
})
