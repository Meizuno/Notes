import { ref, watch } from "vue";

import { api } from "../lib/api";
import type { NoteListItem } from "../lib/types";

// Search across the notes the viewer may read: GET /api/notes?search=, which
// matches titles and content and answers with a snippet around the match.
// Shared app-wide, like useAuth: the sidebar's box and its results are one
// state, wherever the sidebar is drawn.
//
// Debounced while typing. A newer query supersedes an older one still in
// flight, so results never land out of order.

const DEBOUNCE_MS = 200;
/** As many as a sidebar shows; the server caps a page at 100. */
const LIMIT = 30;

const query = ref("");
const results = ref<NoteListItem[]>([]);
const total = ref(0);
const searching = ref(false);
// Bumped by the "/" shortcut; whichever search box is on screen takes focus.
const focusTick = ref(0);

let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(search: string, mine: number): Promise<void> {
  const found: NoteListItem[] = [];
  let count = 0;
  try {
    for await (const line of api.listNotes({ search, limit: LIMIT })) {
      if (mine !== generation) return;
      if ("meta" in line) count = line.meta.total;
      else found.push(line.item);
    }
  } catch {
    // Unreachable or refused: an empty result, said as such by the sidebar.
    found.length = 0;
    count = 0;
  }
  if (mine !== generation) return;
  results.value = found;
  total.value = count;
  searching.value = false;
}

watch(query, (raw) => {
  const search = raw.trim();
  generation += 1;
  clearTimeout(timer);
  if (!search) {
    results.value = [];
    total.value = 0;
    searching.value = false;
    return;
  }
  searching.value = true;
  const mine = generation;
  timer = setTimeout(() => void run(search, mine), DEBOUNCE_MS);
});

export function useSearch() {
  const clear = () => {
    query.value = "";
  };
  const requestFocus = () => {
    focusTick.value += 1;
  };
  return { query, results, total, searching, clear, focusTick, requestFocus };
}
