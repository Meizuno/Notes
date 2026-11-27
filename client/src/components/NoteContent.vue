<script setup lang="ts">
// Note body, rendered in a single declarative pass — no streaming, no
// MutationObserver. The markdown is parsed once into top-level blocks, nested
// into heading sections (buildSectionTree), and rendered recursively by
// <NoteSection>; folds are plain reactive state.
//
// Fold state lives in the markdown source itself (`<!-- collapsed -->` markers
// — the DB of record). Toggling a fold or a task checkbox rewrites the source
// and persists it; the page remounts this component (keyed on the save
// version) when an edit changes the content, so the prop need not be watched.
import type { Token } from "marked";
import { computed, provide, ref } from "vue";
import { useRouter } from "vue-router";

import { useHighlight } from "../composables/useHighlight";
import { api } from "../lib/api";
import { lexMarkdown, renderTokens, setTaskChecked } from "../lib/markdown";
import { buildSectionTree, repeatsTitle } from "../lib/markdown-sections";
import { getCollapsedIndices, toggleHeadingCollapsed, toggleNthTask } from "../lib/markdown-source";
import { NOTE_FOLD_KEY, type NoteFoldApi } from "../lib/note-fold";
import { handleProseClick } from "../lib/prose";
import NoteSection from "./NoteSection.vue";

// `updatedAt` mirrors the Nuxt prop: the page keys this component on it, so an
// edit remounts it and the parse below runs again.
const props = defineProps<{ id: string; content: string; updatedAt: string; title?: string }>();
const router = useRouter();

const source = ref(props.content);
const proseRef = ref<HTMLElement | null>(null);

// Parse once. The blocks are not reactive state: they never change for the
// life of this component, and the renderer looks headings up by identity.
const blocks = lexMarkdown(props.content);
const tree = buildSectionTree<Token>(blocks);
const isEmpty = !tree.lead.length && !tree.sections.length;

const { highlight } = useHighlight(() => blocks);

// Task checkboxes are interactive here (the Nuxt app's enableCheckboxes).
const render = (slice: Token[]) => renderTokens(slice, { highlight: highlight.value, interactiveTasks: true });
const leadHtml = computed(() => render(tree.lead));

const collapsedIndices = computed(() => getCollapsedIndices(source.value));

// A note that opens with `# <its title>` (most do) would say its title twice
// under the page's own. That first heading is dropped from view — unless it
// is folded, when hiding it would leave its section with no way to open.
const leadIsBlank = tree.lead.every((block) => block.type === "space");
const titleSection = computed(() => {
  const first = tree.sections[0];
  if (!props.title || !first || !leadIsBlank) return null;
  if (!repeatsTitle(first.heading, props.title) || collapsedIndices.value.has(first.index)) return null;
  return first.index;
});

// Single in-flight PUT so rapid toggles don't race; a failed save doesn't
// poison later ones (we swallow on the chain).
let savePending: Promise<void> | null = null;
function persist() {
  const snapshot = source.value;
  const prev = savePending ?? Promise.resolve();
  savePending = prev
    .catch(() => {})
    .then(() => api.updateNote(props.id, { content: snapshot }).then(() => undefined));
}

function toggle(index: number) {
  const next = toggleHeadingCollapsed(source.value, index);
  if (next === source.value) return;
  source.value = next;
  persist();
}

provide<NoteFoldApi>(NOTE_FOLD_KEY, {
  isCollapsed: (i) => collapsedIndices.value.has(i),
  toggle,
  render,
});

async function onCheckboxChange(e: Event) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "checkbox" || !proseRef.value) return;
  // Index among checkboxes in document order maps 1:1 onto the Nth task line.
  const boxes = Array.from(proseRef.value.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  const n = boxes.indexOf(input);
  if (n < 0) return;
  const newChecked = input.checked;
  try {
    const next = toggleNthTask(source.value, n, newChecked);
    if (next === null) return;
    source.value = next;
    setTaskChecked(blocks, n, newChecked);
    persist();
    await savePending;
  } catch {
    input.checked = !newChecked; // roll back the visual toggle on save failure
    setTaskChecked(blocks, n, !newChecked);
  }
}

function onClick(e: MouseEvent) {
  handleProseClick(e, (path) => void router.push(path));
}
</script>

<template>
  <div
    ref="proseRef"
    class="prose max-w-none text-[1.02rem] text-default"
    @change="onCheckboxChange"
    @click="onClick"
  >
    <div v-if="tree.lead.length" v-html="leadHtml" />
    <NoteSection v-for="s in tree.sections" :key="s.index" :section="s" :headless="s.index === titleSection" />
    <p v-if="isEmpty" class="text-muted italic text-sm">No content yet.</p>
  </div>
</template>
