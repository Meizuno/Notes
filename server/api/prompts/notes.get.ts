// Default prompt endpoint, called by ai-chat as a "Knowledge base
// overview" suggested prompt. Four modes:
//
//   GET /api/prompts/notes?id=42
//     Returns the full content of a single note for inline display.
//
//   GET /api/prompts/notes?view=graph
//     Returns nodes + edges for a folder-tree graph (folder pseudo-
//     nodes + note leaves), same shape /api/graph uses internally.
//
//   GET /api/prompts/notes?view=folders
//     Returns the same set of folder buckets the `folders` field
//     normally has, but with each bucket's notes inlined. Lets the
//     client paginate one folder at a time.
//
//   GET /api/prompts/notes?folder=Programming&search=...&limit=&offset=
//     Original flat-list mode — paginated notes plus a folder summary
//     for filter chips. Kept for backwards compatibility / search.
//
// Auth: API key (when invoked from ai-chat over HTTP) or session
// cookie (so the same endpoint can be used directly in this app).

type GraphNodeType = 'note' | 'folder'
type GraphNode = {
  id: number | string
  title: string
  type: GraphNodeType
  folder: string | null
  links: number
}
type GraphEdge = { source: number | string, target: number | string }

const folderId = (path: string) => `folder:${path}`
const ancestorPaths = (folder: string): string[] => {
  const out: string[] = []
  let acc = ''
  for (const part of folder.split('/').filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part
    out.push(acc)
  }
  return out
}
const parentOf = (path: string): string | null => {
  const i = path.lastIndexOf('/')
  return i === -1 ? null : path.slice(0, i)
}
const leafName = (path: string): string => {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

export default defineEventHandler(async (event) => {
  verifyPromptAccess(event)
  const db = getPrisma()

  const query = getQuery(event)
  const noteId = query.id ? parseInt(query.id as string) : null
  const folder = query.folder ? String(query.folder).trim() : ''
  const search = query.search ? String(query.search).trim() : ''
  const limit = Math.min(Number(query.limit) || 10, 100)
  const offset = Number(query.offset) || 0
  const view = typeof query.view === 'string' ? query.view : ''

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

  // Graph view — entire vault rendered as folder tree. Mirrors
  // `/api/graph` so ai-chat can show the same Obsidian-style graph
  // it would see if logged into knowledge-base directly.
  if (view === 'graph') {
    const allNotes = await db.note.findMany({
      where: { is_deleted: false },
      select: { id: true, title: true, folder: true }
    })

    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const folderPaths = new Set<string>()
    for (const n of allNotes) {
      if (!n.folder) continue
      for (const p of ancestorPaths(n.folder)) folderPaths.add(p)
    }
    for (const path of folderPaths) {
      nodes.push({
        id: folderId(path),
        title: leafName(path),
        type: 'folder',
        folder: parentOf(path),
        links: 0
      })
    }
    for (const n of allNotes) {
      nodes.push({
        id: n.id,
        title: n.title,
        type: 'note',
        folder: n.folder,
        links: 0
      })
    }
    for (const n of allNotes) {
      if (!n.folder) continue
      edges.push({ source: n.id, target: folderId(n.folder) })
    }
    for (const path of folderPaths) {
      const parent = parentOf(path)
      if (parent === null) continue
      edges.push({ source: folderId(path), target: folderId(parent) })
    }
    const degree = new Map<number | string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    for (const n of nodes) n.links = degree.get(n.id) ?? 0

    return { component: 'notes', view: 'graph', nodes, edges }
  }

  // Folders view — one bucket per top-level folder, notes inlined.
  // Client paginates by stepping through the array (one folder per
  // "page"). All non-deleted notes are returned in one round-trip
  // since the row count is small (titles + folders only).
  if (view === 'folders') {
    const allNotes = await db.note.findMany({
      where: { is_deleted: false },
      select: {
        id: true,
        title: true,
        folder: true,
        content: true,
        updated_at: true
      },
      orderBy: { updated_at: 'desc' }
    })
    const buckets = new Map<string, typeof allNotes>()
    for (const n of allNotes) {
      const top = n.folder ? (n.folder.split('/')[0] ?? '') : ''
      const arr = buckets.get(top) ?? []
      arr.push(n)
      buckets.set(top, arr)
    }
    const folderList = [...buckets.entries()]
      .map(([label, items]) => ({
        label,
        count: items.length,
        notes: items.map(n => ({
          id: n.id,
          title: n.title,
          folder: n.folder,
          snippet: n.content ? n.content.slice(0, 120).trim() + (n.content.length > 120 ? '…' : '') : null,
          hasContent: n.content.length > 0,
          updated_at: n.updated_at
        }))
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

    return {
      component: 'notes',
      view: 'folders',
      folders: folderList,
      total: allNotes.length
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
