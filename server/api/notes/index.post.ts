const VISIBILITY_VALUES = new Set(['PRIVATE', 'PROTECTED', 'PUBLIC'] as const)
type Visibility = 'PRIVATE' | 'PROTECTED' | 'PUBLIC'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { title, content, folder, visibility } = await readBody<{
    title: string
    content?: string
    folder?: string | null
    visibility?: Visibility
  }>(event)
  if (!title?.trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  if (visibility && !VISIBILITY_VALUES.has(visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  }

  const db = getPrisma()
  const trimmedTitle = title.trim()

  // Wrap create + link maintenance in a transaction so the new note,
  // its outgoing-link index, and the dangling-target resolution all
  // land together (or roll back together on failure).
  return db.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        user_id: user.id,
        title: trimmedTitle,
        content: content ?? '',
        folder: folder?.trim() || null,
        visibility: visibility ?? 'PROTECTED'
      }
    })

    // Outgoing wiki-links: parse `[[…]]` from the new content and
    // populate NoteLink rows for this note.
    if (note.content) await indexNoteLinks(tx, [note.id])

    // Incoming dangling links: any existing NoteLink row written as
    // `[[trimmedTitle]]` before this note existed (so to_id was NULL)
    // now resolves to it.
    await tx.noteLink.updateMany({
      where: { to_title: trimmedTitle, to_id: null },
      data: { to_id: note.id }
    })

    return note
  })
})
