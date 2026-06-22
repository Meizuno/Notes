import type { InjectionKey } from 'vue'

// Shared types + injection key for the note fold tree. NoteContent provides
// the context; the recursive NoteSection injects it, so toggle/collapsed
// state and the AST-body helper don't have to thread through every level.

// MDC AST shapes, derived from the parser so we don't hand-maintain them.
type ParseResult = Awaited<ReturnType<typeof parseMarkdown>>
export type MdcBody = ParseResult['body']
export type MdcNode = MdcBody['children'][number]

export type NoteFoldApi = {
  // Whether the heading at this document-order index is collapsed.
  isCollapsed: (index: number) => boolean
  // Toggle that heading's fold (writes the source marker + persists).
  toggle: (index: number) => void
  // Wrap a slice of AST nodes back into a body MDCRenderer can render.
  rootOf: (children: MdcNode[]) => MdcBody
}

export const NOTE_FOLD_KEY: InjectionKey<NoteFoldApi> = Symbol('note-fold')
