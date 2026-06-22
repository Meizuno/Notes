<script setup lang="ts">
// One foldable heading section, rendered declaratively (no post-render DOM
// injection). The whole heading node is rendered by MDCRenderer (so its
// inline content — code, bold, links — stays correct); a wrapping
// `.kb-heading` div is the click target, and the disclosure caret is drawn
// as a ::before on the heading (see main.css). The section body — direct
// content blocks plus nested subsections — lives in a collapsible wrapper.
import type { SectionNode } from '~/utils/markdown-sections'
import { NOTE_FOLD_KEY, type MdcNode } from '~/utils/note-fold'

const props = defineProps<{ section: SectionNode<MdcNode> }>()

// Provided by NoteContent (root of the tree).
const fold = inject(NOTE_FOLD_KEY)!

const collapsed = computed(() => fold.isCollapsed(props.section.index))

function toggle() {
  fold.toggle(props.section.index)
}
</script>

<template>
  <div
    class="kb-heading"
    :class="{ 'is-collapsed': collapsed }"
    role="button"
    tabindex="0"
    :aria-expanded="!collapsed"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <MDCRenderer :body="fold.rootOf([section.heading])" />
  </div>

  <!-- A single inner child is required: the .kb-fold-block grid collapses
       via grid-template-rows 1fr→0fr, which only zeroes its first row.
       Wrapping all the body content in one div keeps it to one row so the
       whole section actually collapses (not just its first block). -->
  <div class="kb-fold-block" :class="{ 'is-folded': collapsed }">
    <div class="kb-fold-block-inner">
      <MDCRenderer v-if="section.blocks.length" :body="fold.rootOf(section.blocks)" />
      <NoteSection v-for="child in section.children" :key="child.index" :section="child" />
    </div>
  </div>
</template>
