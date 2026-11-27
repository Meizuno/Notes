<script setup lang="ts">
// Markdown rendered whole, without folds — the editor's preview, where the
// Nuxt app used <MDC :value>. Task checkboxes stay disabled, as MDC left them.
import { computed } from "vue";
import { useRouter } from "vue-router";

import { useHighlight } from "../composables/useHighlight";
import { lexMarkdownLines, renderTokens, renderTokensWithLines } from "../lib/markdown";
import { handleProseClick } from "../lib/prose";

// `lines`: mark each block with the source line it starts on, for the editor's
// preview to scroll with the text (useScrollSync).
const props = defineProps<{ value: string; lines?: boolean }>();
const router = useRouter();

const lexed = computed(() => lexMarkdownLines(props.value));
const blocks = computed(() => lexed.value.tokens);
const { highlight } = useHighlight(blocks);
const html = computed(() =>
  props.lines
    ? renderTokensWithLines(blocks.value, lexed.value.lines, { highlight: highlight.value })
    : renderTokens(blocks.value, { highlight: highlight.value }),
);

function onClick(e: MouseEvent) {
  handleProseClick(e, (path) => void router.push(path));
}
</script>

<template>
  <div @click="onClick" v-html="html" />
</template>
