<script setup lang="ts">
// Markdown rendered whole, without folds — the editor's preview, where the
// Nuxt app used <MDC :value>. Task checkboxes stay disabled, as MDC left them.
import { computed } from "vue";
import { useRouter } from "vue-router";

import { useHighlight } from "../composables/useHighlight";
import { lexMarkdown, renderTokens } from "../lib/markdown";
import { handleProseClick } from "../lib/prose";

const props = defineProps<{ value: string }>();
const router = useRouter();

const blocks = computed(() => lexMarkdown(props.value));
const { highlight } = useHighlight(blocks);
const html = computed(() => renderTokens(blocks.value, { highlight: highlight.value }));

function onClick(e: MouseEvent) {
  handleProseClick(e, (path) => void router.push(path));
}
</script>

<template>
  <div @click="onClick" v-html="html" />
</template>
