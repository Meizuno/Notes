import { ref, shallowRef } from "vue";

import { api } from "../lib/api";
import type { TreeNote } from "../lib/types";

// The vault's two read views — the sidebar folder tree and the home force
// graph — are cached across navigation, so a note write won't show up (or a
// deleted note lingers) until they are refetched. Call refreshVault() after
// any create/update/delete — the Nuxt app's refreshNuxtData(['sidebar-tree',
// 'graph']).
//
// The tree is held here, shared by the sidebar and the note form's folder
// suggestions (one request, as the Nuxt app's shared useFetch key made it).
// The graph is fetched by the graph view each time it mounts; `version` tells
// a mounted one to fetch again.
const tree = shallowRef<TreeNote[] | null>(null);
const version = ref(0);
let inflight: Promise<void> | null = null;

function fetchTree(): Promise<void> {
  inflight ??= api
    .getTree()
    .then((rows) => {
      tree.value = rows;
    })
    .catch(() => {
      // Keep what was there; an empty sidebar on a hiccup would read as data loss.
      tree.value ??= [];
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useVault() {
  /** The tree, fetched once and then kept. */
  const loadTree = () => (tree.value === null ? fetchTree() : Promise.resolve());

  const refreshVault = async () => {
    version.value++;
    await fetchTree();
  };

  return { tree, version, loadTree, refreshVault };
}
