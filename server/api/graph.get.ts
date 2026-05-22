import { getPrisma } from '../utils/db'

// Graph endpoint for the home page. Builds the wiki-link topology:
// every node is a note, every edge is a resolved `[[Title]]`
// reference from `NoteLink`. Anchored notes attract each other via
// the d3 force simulation in graph-view.vue, so dense wiki-linking
// clusters notes together visually à la Obsidian.
//
// Visibility:
//   - Notes are filtered through `noteVisibilityWhere(event)` so anon
//     viewers only see PUBLIC notes and authed users don't see other
//     users' PRIVATE notes.
//   - Edges are restricted to (visible-note → visible-note) pairs.
//     Unresolved targets (to_id NULL) are dropped — they'd appear as
//     dangling nodes which the renderer doesn't have a visual for
//     right now.
//
// Wire format:
//   {
//     nodes: [{ id, title, folder, links }, ...],
//     edges: [{ source, target }, ...]
//   }

type GraphNode = {
  id: string
  title: string
  folder: string | null
  links: number
}

type GraphEdge = {
  source: string
  target: string
}

export default defineEventHandler(async (event) => {
  const db = getPrisma()

  const notes = await db.note.findMany({
    where: noteVisibilityWhere(event),
    select: { id: true, title: true, folder: true }
  })

  const visibleIds = notes.map(n => n.id)
  const visibleSet = new Set(visibleIds)

  // Resolved wiki-links between visible notes. `to_id` is null when
  // the target title doesn't exist yet; we drop those. The
  // `in: visibleIds` constraint also implicitly excludes nulls.
  const links = visibleIds.length
    ? await db.noteLink.findMany({
        where: {
          from_id: { in: visibleIds },
          to_id:   { in: visibleIds }
        },
        select: { from_id: true, to_id: true }
      })
    : []

  const nodes: GraphNode[] = notes.map(n => ({
    id: n.id,
    title: n.title,
    type: 'note',
    folder: n.folder,
    links: 0
  }))

  const edges: GraphEdge[] = []
  for (const link of links) {
    if (!link.to_id || !visibleSet.has(link.to_id)) continue
    edges.push({ source: link.from_id, target: link.to_id })
  }

  // Degree count drives node sizing in the renderer — highly-linked
  // notes get a slightly larger disc.
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) n.links = degree.get(n.id) ?? 0

  return { nodes, edges }
})
