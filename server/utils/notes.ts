import type { H3Event } from 'h3'
import type { Prisma } from '@prisma/client'
import { NoteVisibility } from '@prisma/client'
import { getPrisma } from './db'

// Shared note projection used by `/api/notes/[id]` (edit form load).
// The streaming view endpoint at `/api/notes/[id]/stream` embeds its
// own select and emits metadata + content over the wire.

export type NoteRow = {
  id: string
  title: string
  folder: string | null
  content: string
  visibility: NoteVisibility
  updated_at: Date
}

export { NoteVisibility }

// Visibility filter for read endpoints. Standard web-auth model:
//   anon   → PUBLIC only.
//   authed → PUBLIC + PROTECTED + own PRIVATE notes. Other users'
//            PRIVATE notes are excluded.
// Returns a Prisma where-clause fragment.
export function noteVisibilityWhere(event: H3Event): Prisma.NoteWhereInput {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    return { is_deleted: false, visibility: NoteVisibility.PUBLIC }
  }
  return {
    is_deleted: false,
    OR: [
      { visibility: { not: NoteVisibility.PRIVATE } },
      { visibility: NoteVisibility.PRIVATE, user_id: user.id }
    ]
  }
}

export function loadNote(event: H3Event, id: string): Promise<NoteRow | null> {
  return getPrisma().note.findFirst({
    where: { id, ...noteVisibilityWhere(event) },
    select: {
      id: true,
      title: true,
      folder: true,
      content: true,
      visibility: true,
      updated_at: true
    }
  })
}

// Wiki-link helpers.
//
// Markdown source uses `[[Title]]` to reference another note by its
// title. This is convenient to write but fragile under rename — if a
// note's title changes, every other note that referenced its *old*
// title now points at nothing.
//
// The pair below keeps things consistent on rename:
//   - cascadeTitleRename rewrites `[[oldTitle]]` → `[[newTitle]]` in
//     every other note's content. It then re-indexes the affected
//     source notes' rows in `NoteLink` so the graph stays in sync.
//   - indexNoteLinks re-derives `NoteLink` rows for a given set of
//     notes by parsing their content from scratch. Used by the
//     rename cascade and exported so other endpoints (POST/PUT
//     content edits) can keep the link index live as well.

const WIKI_RE = /\[\[([^\]]+)\]\]/g

// Re-parse the content of the given notes and rewrite their outgoing
// rows in `NoteLink` from scratch. Resolves each `[[Title]]` against
// the *current* set of non-deleted notes; unresolved targets are
// stored with `to_id = null` (dangling).
export async function indexNoteLinks(
  db: Prisma.TransactionClient,
  noteIds: string[]
): Promise<void> {
  if (!noteIds.length) return

  const sources = await db.note.findMany({
    where: { id: { in: noteIds }, is_deleted: false },
    select: { id: true, content: true }
  })

  // Build the title → id resolver from the full vault. A separate
  // query because some `[[Title]]` references may point at notes
  // outside `noteIds`.
  const allNotes = await db.note.findMany({
    where: { is_deleted: false },
    select: { id: true, title: true }
  })
  const idByTitle = new Map(allNotes.map(n => [n.title, n.id]))

  // Wipe old rows for these sources, then re-create from the parse.
  await db.noteLink.deleteMany({ where: { from_id: { in: noteIds } } })

  const rows: { from_id: string, to_title: string, to_id: string | null }[] = []
  for (const src of sources) {
    const seen = new Set<string>()
    for (const m of src.content.matchAll(WIKI_RE)) {
      const target = m[1]?.trim()
      if (!target || seen.has(target)) continue
      seen.add(target)
      rows.push({
        from_id: src.id,
        to_title: target,
        to_id: idByTitle.get(target) ?? null
      })
    }
  }
  if (rows.length) {
    await db.noteLink.createMany({ data: rows, skipDuplicates: true })
  }
}

// Cascade a note's title change through every wiki-link that points
// at it. Rewrites `[[oldTitle]]` → `[[newTitle]]` in every other
// note's content (using the GIN trigram index on `content` so the
// scan is cheap), then refreshes their `NoteLink` rows.
//
// Also resolves any previously-dangling links that *match* the new
// title — e.g., a note was created later and is now the target of a
// pre-existing `[[name]]`.
export async function cascadeTitleRename(
  db: Prisma.TransactionClient,
  noteId: string,
  oldTitle: string,
  newTitle: string
): Promise<void> {
  if (oldTitle === newTitle) return

  // GIN trigram index on `content` makes substring search efficient.
  // Source notes are filtered to non-deleted only; soft-deleted notes
  // don't render so updating their content is wasted work.
  const sources = await db.note.findMany({
    where: {
      is_deleted: false,
      content: { contains: `[[${oldTitle}]]` }
    },
    select: { id: true, content: true }
  })

  if (sources.length) {
    // Match `[[oldTitle]]` allowing optional inner whitespace, same
    // tolerance the wiki-link parser applies on the read path.
    const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const linkRe = new RegExp(`\\[\\[\\s*${escaped}\\s*\\]\\]`, 'g')
    const replacement = `[[${newTitle}]]`

    const updatedIds: string[] = []
    for (const src of sources) {
      const next = src.content.replace(linkRe, replacement)
      if (next !== src.content) {
        await db.note.update({
          where: { id: src.id },
          data: { content: next }
        })
        updatedIds.push(src.id)
      }
    }
    // Refresh the link index for the notes we just touched.
    await indexNoteLinks(db, updatedIds)
  }

  // Previously-dangling references (`[[newTitle]]` written before a
  // note with that title existed) now resolve to this note.
  await db.noteLink.updateMany({
    where: { to_title: newTitle, to_id: null },
    data: { to_id: noteId }
  })
}
