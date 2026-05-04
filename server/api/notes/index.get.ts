// Streaming endpoint for the note list (used by /notes). Emits NDJSON:
//
//   {"meta":{"total":N,"hasMore":boolean}}\n
//   {"item":{...note}}\n
//   ...
//
// Meta arrives first so the client can clear loading state and sync
// pagination flags before cards begin rendering. Items follow in
// display order (newest updated first). Pagination params: limit,
// offset, search, folder.

const DEFAULT_LIMIT = 20

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const query = getQuery(event)
  const search = query.search ? String(query.search) : ''
  // Optional folder filter — passes a slash-separated prefix and the
  // endpoint returns every note inside that folder (and its subfolders).
  const folder = query.folder ? String(query.folder).trim() : ''
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, 100)
  const offset = Number(query.offset) || 0

  const db = getPrisma()
  const where = {
    is_deleted: false,
    ...(search ? {
      OR: [
        { title:   { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {}),
    ...(folder ? { folder: { startsWith: folder } } : {})
  }

  const [items, total] = await Promise.all([
    db.note.findMany({
      where,
      select: {
        id: true,
        title: true,
        folder: true,
        content: true,
        updated_at: true
      },
      orderBy: { updated_at: 'desc' },
      skip: offset,
      take: limit
    }),
    db.note.count({ where })
  ])

  const makeSnippet = (content: string) => {
    if (!content) return null
    if (search) {
      const idx = content.toLowerCase().indexOf(search.toLowerCase())
      if (idx >= 0) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(content.length, idx + search.length + 40)
        return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
      }
    }
    return content.slice(0, 120).trim() + (content.length > 120 ? '…' : '')
  }

  setHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'x-accel-buffering', 'no')

  const enc = new TextEncoder()
  const meta = { total, hasMore: offset + items.length < total }

  // Deliberate per-item pacing so the client sees a visible cascade
  // rather than 20 cards landing in the same frame.
  const ITEM_INTERVAL_MS = 30

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(JSON.stringify({ meta }) + '\n'))
      await new Promise(r => setImmediate(r))
      for (const r of items) {
        const item = {
          id: r.id,
          title: r.title,
          folder: r.folder,
          updated_at: r.updated_at,
          snippet: makeSnippet(r.content)
        }
        controller.enqueue(enc.encode(JSON.stringify({ item }) + '\n'))
        await new Promise(r => setTimeout(r, ITEM_INTERVAL_MS))
      }
      controller.close()
    }
  })
})
