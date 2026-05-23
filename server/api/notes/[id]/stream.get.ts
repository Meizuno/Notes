import { getPrisma } from '../../../utils/db'
import { noteVisibilityWhere } from '../../../utils/notes'

// Streaming endpoint for note metadata + markdown content. Sends a
// single metadata record first so the client can paint the title,
// folder, and date immediately, then splits the document into
// paragraph-sized chunks (with code-fence awareness) and emits each
// as one NDJSON line. The client renders each chunk as an independent
// `<MDCRenderer>` block, which avoids the re-parse cost of repeatedly
// rendering an ever-growing buffer.
//
// Wire format:
//   {"meta":{"title":"...","folder":"...","updated_at":"..."}}\n
//   {"text":"# Title\n"}\n
//   {"text":"...next paragraph..."}\n

function splitMarkdown(content: string): string[] {
  const lines = content.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inCode = false

  for (const line of lines) {
    if (line.startsWith('```')) inCode = !inCode
    if (!inCode && line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    else {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const note = await getPrisma().note.findFirst({
    where: { id, ...noteVisibilityWhere(event) },
    select: {
      id: true,
      title: true,
      folder: true,
      content: true,
      updated_at: true
    }
  })
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  setHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'x-accel-buffering', 'no')  // disable proxy buffering

  const meta = {
    id: note.id,
    title: note.title,
    folder: note.folder,
    updated_at: note.updated_at
  }
  const chunks = splitMarkdown(note.content)
  const enc = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(JSON.stringify({ meta }) + '\n'))
      await new Promise(r => setImmediate(r))
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(JSON.stringify({ text: chunk }) + '\n'))
        // Yield to the event loop so the chunk actually flushes to
        // the wire instead of being coalesced into one big write.
        await new Promise(r => setImmediate(r))
      }
      controller.close()
    }
  })
})
