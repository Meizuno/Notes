import type { InjectionKey } from "vue";
import type { Token } from "marked";

// Shared types + injection key for the note fold tree. NoteContent provides
// the context; the recursive NoteSection injects it, so toggle/collapsed state
// and the renderer don't have to thread through every level.

export type NoteFoldApi = {
  // Whether the heading at this document-order index is collapsed.
  isCollapsed: (index: number) => boolean;
  // Toggle that heading's fold (writes the source marker + persists).
  toggle: (index: number) => void;
  // Render a slice of top-level blocks to HTML — the MDCRenderer of the Nuxt
  // app's `rootOf`. Reactive: it re-renders once the highlighter has loaded.
  render: (blocks: Token[]) => string;
};

export const NOTE_FOLD_KEY: InjectionKey<NoteFoldApi> = Symbol("note-fold");
