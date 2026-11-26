import { shallowRef, watch, type WatchSource } from "vue";
import type { Token } from "marked";

import { loadHighlight, type Highlight } from "../lib/highlight";
import { codeInfos } from "../lib/markdown";

/**
 * Shiki for these blocks, once it has loaded. Null until then (and for markdown
 * with no code at all, which never loads it); rendering in the meantime shows
 * the code uncoloured in the same box.
 */
export function useHighlight(tokens: WatchSource<Token[]>) {
  const highlight = shallowRef<Highlight | null>(null);
  let asked = 0;

  watch(
    tokens,
    (blocks) => {
      const infos = codeInfos(blocks);
      if (!infos.length) return;
      const mine = ++asked;
      loadHighlight(infos)
        .then((h) => {
          // A later edit asked for other grammars; that answer wins.
          if (mine === asked) highlight.value = h;
        })
        .catch(() => {
          /* offline or a stale build: the code stays plain */
        });
    },
    { immediate: true },
  );

  return { highlight };
}
