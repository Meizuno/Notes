<script setup lang="ts">
// One foldable heading section, rendered declaratively. The heading block is
// rendered whole (so its inline content — code, bold, links — stays correct);
// a wrapping `.kb-heading` div is the click target, and the disclosure caret
// is drawn as a ::before on the heading (see main.css). The section body —
// direct content blocks plus nested subsections — lives in a collapsible
// wrapper.
import type { Token } from "marked";
import { computed, inject } from "vue";

import type { SectionNode } from "../lib/markdown-sections";
import { NOTE_FOLD_KEY } from "../lib/note-fold";

// `headless`: the heading only repeats the note's title, which the page
// already shows — the section is drawn without it, and so cannot fold.
const props = defineProps<{ section: SectionNode<Token>; headless?: boolean }>();

// Provided by NoteContent (root of the tree).
const fold = inject(NOTE_FOLD_KEY)!;

const collapsed = computed(() => !props.headless && fold.isCollapsed(props.section.index));
const headingHtml = computed(() => fold.render([props.section.heading]));
const blocksHtml = computed(() => fold.render(props.section.blocks));

function toggle() {
  fold.toggle(props.section.index);
}

// A link inside a heading navigates (NoteContent handles it); it does not also
// fold the section on the way out.
function onHeadingClick(e: MouseEvent) {
  if (e.target instanceof Element && e.target.closest("a")) return;
  toggle();
}
</script>

<template>
  <div
    v-if="!headless"
    class="kb-heading"
    :class="{ 'is-collapsed': collapsed }"
    role="button"
    tabindex="0"
    :aria-expanded="!collapsed"
    @click="onHeadingClick"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <div v-html="headingHtml" />
  </div>

  <!-- A single inner child is required: the .kb-fold-block grid collapses via
       grid-template-rows 1fr→0fr, which only zeroes its first row. Wrapping
       all the body content in one div keeps it to one row so the whole section
       actually collapses (not just its first block). -->
  <div class="kb-fold-block" :class="{ 'is-folded': collapsed }">
    <div class="kb-fold-block-inner">
      <div v-if="section.blocks.length" v-html="blocksHtml" />
      <NoteSection v-for="child in section.children" :key="child.index" :section="child" />
    </div>
  </div>
</template>
