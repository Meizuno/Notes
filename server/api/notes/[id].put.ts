const VISIBILITY_VALUES = new Set(['PRIVATE', 'PROTECTED', 'PUBLIC'] as const)
type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const { title, content, folder, visibility } = await readBody<{
    title?: string
    content?: string
    folder?: string | null
    visibility?: Visibility
  }>(event)
  if (visibility !== undefined && !VISIBILITY_VALUES.has(visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  }

  const db = getPrisma()

  // Notes are a shared workspace — any authenticated user can edit
  // any note. Just verify it exists and isn't soft-deleted.
  const existing = await db.note.findFirst({ where: { id, is_deleted: false } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Note not found' })

  const trimmedNewTitle = title !== undefined ? title.trim() : undefined
  const titleChanged = trimmedNewTitle !== undefined && trimmedNewTitle !== existing.title
  const contentChanged = content !== undefined && content !== existing.content

  // Run the update + cascade in a transaction so a partial failure
  // (e.g., one of the cascaded content updates 500ing) doesn't leave
  // the vault with a half-renamed graph.
  return db.$transaction(async (tx) => {
    const updated = await tx.note.update({
      where: { id },
      data: {
        ...(trimmedNewTitle !== undefined ? { title: trimmedNewTitle } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(folder !== undefined ? { folder: folder?.trim() || null } : {}),
        ...(visibility !== undefined ? { visibility } : {})
      }
    })

    // Rename cascade: rewrite `[[oldTitle]]` to `[[newTitle]]` in
    // every other note's content, refresh their NoteLink rows, and
    // re-resolve any dangling links that now match the new title.
    if (titleChanged) {
      await cascadeTitleRename(tx, id, existing.title, trimmedNewTitle!)
    }

    // Re-index this note's own outgoing wiki-links whenever content
    // changed, so the graph stays in sync with what was just saved.
    if (contentChanged) {
      await indexNoteLinks(tx, [id])
    }

    return updated
  })
})
