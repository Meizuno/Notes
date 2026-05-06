// Default prompt endpoint, called by ai-chat as a "Knowledge base
// overview" suggested prompt. Two modes:
//
//   GET /api/prompts/notes?id=42
//     Returns the full content of a single note for inline display.
//
//   GET /api/prompts/notes?folder=Programming&search=...&limit=&offset=
//     Returns a paginated list of notes plus a folder summary the
//     client uses for filter chips (folder path → count, sorted by
//     count desc).
//
// Auth: API key (when invoked from ai-chat over HTTP) or session
// cookie (so the same endpoint can be used directly in this app).

export default defineEventHandler(async (event) => {
  verifyPromptAccess(event)
  const db = getPrisma()

  const query = getQuery(event)
  const noteId = query.id ? parseInt(query.id as string) : null
  const folder = query.folder ? String(query.folder).trim() : ''
  const search = query.search ? String(query.search).trim() : ''
  const limit = Math.min(Number(query.limit) || 10, 100)
  const offset = Number(query.offset) || 0

  // Single-note detail.
  if (noteId) {
    const note = await db.note.findFirst({
      where: { id: noteId, is_deleted: false },
      select: {
        id: true,
        title: true,
        content: true,
        folder: true,
        updated_at: true
      }
    })
    if (!note) throw createError({ statusCode: 404, statusMessage: 'Note not found' })
    return {
      component: 'note-detail',
      note
    }
  }

  // List view.
  const where = {
    is_deleted: false,
    ...(search ? {
      OR: [
        { title:   { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {}),
    // Folder filter is a prefix match, so passing "Programming" also
    // includes notes under "Programming/Rust", matching the sidebar
    // tree's "click a parent → see everything inside" behaviour.
    ...(folder ? { folder: { startsWith: folder } } : {})
  }

  // Folder summary is computed across the full vault (not the filter)
  // so the chips remain stable as the user filters — clicking one
  // narrows the list, the other counts stay put.
  const [allFolders, items, total] = await Promise.all([
    db.note.findMany({
      where: { is_deleted: false },
      select: { folder: true }
    }),
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

  // Roll notes up to top-level folders. A note in "Programming/Rust"
  // contributes to the "Programming" bucket; root notes get the empty
  // string. We expose top-levels only because that's what the chip row
  // can fit — deeper navigation is the sidebar's job.
  const folderCounts = new Map<string, number>()
  for (const n of allFolders) {
    const top = n.folder ? (n.folder.split('/')[0] ?? '') : ''
    folderCounts.set(top, (folderCounts.get(top) ?? 0) + 1)
  }
  const folders = [...folderCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

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

  return {
    component: 'notes',
    folders,
    notes: items.map(n => ({
      id: n.id,
      title: n.title,
      folder: n.folder,
      snippet: makeSnippet(n.content),
      hasContent: n.content.length > 0,
      updated_at: n.updated_at
    })),
    total,
    hasMore: offset + items.length < total,
    activeFolder: folder,
    activeSearch: search
  }
})
