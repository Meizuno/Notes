<script lang="ts">
// Folder tree of the vault, rendered with Nuxt UI's <UTree>. Folders start
// collapsed; open them individually, and a "Collapse all" action (shown once
// anything is open) tidies them back — there is no bulk expand. Expand state
// persists across SPA navigation (module state) and resets to collapsed on a
// full reload.
import { computed, onMounted, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useVault } from "../composables/useVault";

type TreeItem = {
  label: string;
  value: string;
  icon?: string;
  // Drives the within-folder sort. Folders carry the oldest createdAt of any
  // descendant note so folder ordering follows the notes inside; notes carry
  // their own row's created_at.
  createdAt?: string;
  children?: TreeItem[];
  onSelect?: (e: Event) => void;
};

// The Nuxt app's useState('home-tree-expanded'): shared by every instance,
// kept across navigation, gone on reload.
const expanded = ref<string[]>([]);
</script>

<script setup lang="ts">
const { tree: notes, loadTree } = useVault();
const route = useRoute();
const router = useRouter();

onMounted(() => void loadTree());

// Highlight the active note when we're sitting on a note page (/<slug>).
// Notes live at the root, so the active key is the single path segment;
// non-note roots (/new, /login) just won't match any tree row.
const activeNoteId = computed(() => {
  const m = route.path.match(/^\/([^/]+)\/?$/);
  return m && m[1] ? m[1] : null;
});

// Collapse-only: folders open individually, and this is the single bulk
// action — there is no "expand all".
function collapseAll() {
  expanded.value = [];
}

const items = computed<TreeItem[]>(() => {
  const root: TreeItem = { label: "", value: "__root__", children: [] };
  for (const n of notes.value ?? []) {
    const parts = n.folder ? n.folder.split("/").filter(Boolean) : [];
    let parent = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let folder = parent.children!.find((c) => c.children && c.value === acc);
      if (!folder) {
        folder = {
          label: part,
          value: acc,
          icon: "i-lucide-folder",
          children: [],
        };
        parent.children!.push(folder);
      }
      // Bubble each note's createdAt up to every ancestor folder so a folder's
      // effective createdAt is the OLDEST note inside — matches the
      // "ascending = oldest first" sort the user sees.
      if (!folder.createdAt || n.created_at < folder.createdAt) {
        folder.createdAt = n.created_at;
      }
      parent = folder;
    }
    // Per-item onSelect: clicks on note rows navigate. Folders have no
    // onSelect, so clicking them just toggles expand via UTree's built-in
    // behavior. The row's value is the slug so it matches the `/<slug>` URL for
    // active-row highlighting, and clicking navigates by slug.
    const slug = n.slug;
    parent.children!.push({
      label: n.title,
      value: slug,
      icon: "i-lucide-file-text",
      createdAt: n.created_at,
      onSelect: () => void router.push(`/${slug}`),
    });
  }
  // Sort children: folders first (so structure reads at a glance), then within
  // each kind by createdAt asc — oldest content first. Fallback to label for
  // items missing createdAt (defensive).
  const sortRecursive = (node: TreeItem) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      const aFolder = !!a.children;
      const bFolder = !!b.children;
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
      return a.label.localeCompare(b.label);
    });
    node.children.forEach(sortRecursive);
  };
  sortRecursive(root);
  return root.children ?? [];
});

// Selection is an item object (reka-ui semantics), not a string. Sync it from
// the route so the active note row stays highlighted as we navigate. The
// getKey prop on <UTree> matches items by `value`, so any item with the right
// value works as the selected reference.
const selected = ref<TreeItem | undefined>();
watchEffect(() => {
  if (!activeNoteId.value) {
    selected.value = undefined;
    return;
  }
  const find = (list: TreeItem[]): TreeItem | undefined => {
    for (const it of list) {
      if (!it.children && it.value === activeNoteId.value) return it;
      if (it.children) {
        const f = find(it.children);
        if (f) return f;
      }
    }
    return undefined;
  };
  selected.value = find(items.value);
});

const count = computed(() => notes.value?.length ?? 0);
const getKey = (item: TreeItem) => item.value;
</script>

<template>
  <div class="px-1">
    <div class="mb-1 flex min-h-8 items-center gap-2 px-1.5">
      <span v-if="notes" class="text-xs font-extrabold uppercase tracking-wide text-muted">
        {{ count }} note{{ count === 1 ? "" : "s" }}
      </span>
      <UButton
        v-if="expanded.length > 0"
        icon="i-lucide-chevrons-down-up"
        variant="ghost"
        color="neutral"
        size="xs"
        class="ml-auto"
        aria-label="Collapse all folders"
        @click="collapseAll"
      />
    </div>

    <UTree
      v-if="items.length"
      v-model="selected"
      v-model:expanded="expanded"
      :items="items"
      :get-key="getKey"
      size="md"
      color="primary"
      :ui="{ link: 'rounded-xl font-semibold', linkLeadingIcon: 'text-dimmed' }"
    />

    <div v-else-if="notes" class="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <UIcon name="i-lucide-folder-tree" class="size-9 text-dimmed" />
      <p class="text-sm text-muted">No notes yet</p>
      <UButton to="/new" icon="i-lucide-plus" label="Create your first note" size="sm" color="primary" />
    </div>
  </div>
</template>
