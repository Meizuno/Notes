import { getPrisma } from '../utils/db'

// Graph endpoint for the home page. Returns every non-deleted note as
// a node, plus synthetic nodes for `[[Title]]` references that don't
// resolve to a real note (Obsidian renders these dimmed). Edges come
// from the `NoteLink` index — already maintained on save, so this
// endpoint is just two cheap reads.
//
// Each node carries its top-level folder so the client can color by
// group (top folder = color bucket). Dangling nodes have `folder: null`.
//
// Wire format:
//   {
//     nodes: [{ id, title, resolved, folder, links }, ...],
//     edges: [{ source, target }, ...]
//   }

type GraphNode = {
  id: number | string
  title: string
  resolved: boolean
  folder: string | null
  links: number
}

type GraphEdge = {
  source: number | string
  target: number | string
}

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const db = getPrisma()

  const [notes, links] = await Promise.all([
    db.note.findMany({
      where: { is_deleted: false },
      select: { id: true, title: true, folder: true }
    }),
    db.noteLink.findMany({
      select: { from_id: true, to_id: true, to_title: true }
    })
  ])

  const realTitles = new Set(notes.map(n => n.title))

  const nodes: GraphNode[] = notes.map(n => ({
    id: n.id,
    title: n.title,
    resolved: true,
    folder: n.folder,
    links: 0
  }))

  // Synthetic nodes for dangling targets. Deduped by title.
  const dangling = new Set<string>()
  for (const link of links) {
    if (link.to_id == null && !realTitles.has(link.to_title)) {
      dangling.add(link.to_title)
    }
  }
  for (const title of dangling) {
    nodes.push({
      id: `dangling:${title}`,
      title,
      resolved: false,
      folder: null,
      links: 0
    })
  }

  const edges: GraphEdge[] = links.map(l => ({
    source: l.from_id,
    target: l.to_id ?? `dangling:${l.to_title}`
  }))

  // Degree count, used for node sizing on the client.
  const degree = new Map<number | string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) n.links = degree.get(n.id) ?? 0

  return { nodes, edges }
})
