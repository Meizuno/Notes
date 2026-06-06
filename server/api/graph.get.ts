import { getPrisma } from '../utils/db'

// Graph endpoint for the home page. Builds a folder-tree topology:
//
//   - One pseudo-node per unique folder path (a slash-separated
//     prefix counts as its own folder, so `Programming/Languages`
//     produces both `Programming` and `Programming/Languages`).
//   - Each note connects to its leaf folder; each folder pseudo-node
//     connects to its parent. The result is a forest where notes
//     cluster around their folder ancestors.
//
// The `type` field on each node tells the renderer how to draw it
// (notes get colour-by-top-folder, folders get a neutral disc).
//
// Wire format:
//   {
//     nodes: [{ id, title, type, folder, links }, ...],
//     edges: [{ source, target }, ...]
//   }
// `id` is the note's UUID for note nodes and a string of the form
// `folder:<path>` for folder pseudo-nodes. The client treats every
// id as opaque.

type NodeType = 'note' | 'folder'

type GraphNode = {
  id: string
  title: string
  type: NodeType
  folder: string | null     // parent folder path (null = root)
  links: number             // degree, computed below for sizing
}

type GraphEdge = {
  source: string
  target: string
}

function folderId(path: string): string {
  return `folder:${path}`
}

// "Programming/Languages" → ["Programming", "Programming/Languages"]
function ancestorPaths(folder: string): string[] {
  const out: string[] = []
  let acc = ''
  for (const part of folder.split('/').filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part
    out.push(acc)
  }
  return out
}

function parentOf(path: string): string | null {
  const i = path.lastIndexOf('/')
  return i === -1 ? null : path.slice(0, i)
}

function leafName(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

export default defineEventHandler(async (event) => {
  const db = getPrisma()

  const notes = await db.note.findMany({
    where: noteVisibilityWhere(viewerId(event)),
    select: { id: true, title: true, folder: true }
  })

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Discover every folder path referenced by any note (including
  // ancestor prefixes — folders are implicit, never stored as rows).
  const folderPaths = new Set<string>()
  for (const n of notes) {
    if (!n.folder) continue
    for (const p of ancestorPaths(n.folder)) folderPaths.add(p)
  }

  // Folder pseudo-nodes first so the renderer can paint them under
  // the note discs when the simulation overlaps.
  for (const path of folderPaths) {
    nodes.push({
      id: folderId(path),
      title: leafName(path),
      type: 'folder',
      folder: parentOf(path),
      links: 0
    })
  }

  // Notes.
  for (const n of notes) {
    nodes.push({
      id: n.id,
      title: n.title,
      type: 'note',
      folder: n.folder,
      links: 0
    })
  }

  // Note → its leaf folder.
  for (const n of notes) {
    if (!n.folder) continue
    edges.push({ source: n.id, target: folderId(n.folder) })
  }

  // Folder → its parent folder.
  for (const path of folderPaths) {
    const parent = parentOf(path)
    if (parent === null) continue
    edges.push({ source: folderId(path), target: folderId(parent) })
  }

  // Degree count for node sizing.
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) n.links = degree.get(n.id) ?? 0

  return { nodes, edges }
})
