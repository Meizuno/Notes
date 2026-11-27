<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";

import { useImagePaste, type TextareaHost } from "../composables/useImagePaste";
import { useMarkdownFormatter } from "../composables/useMarkdownFormatter";
import { useVault } from "../composables/useVault";
import { applyMarkdown, type MarkdownAction } from "../lib/markdown-edit";
import type { Visibility } from "../lib/types";
import MarkdownPreview from "./MarkdownPreview.vue";

const props = defineProps<{
  saving?: boolean;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  submit: [];
  cancel: [];
}>();

const title = defineModel<string>("title", { default: "" });
const folder = defineModel<string>("folder", { default: "" });
const description = defineModel<string>("description", { default: "" });
const content = defineModel<string>("content", { default: "" });
const visibility = defineModel<Visibility>("visibility", { default: "PROTECTED" });
const shared = defineModel<boolean>("shared", { default: false });

// PUBLIC notes are shareable by definition — force the switch on (and the
// template disables it) so its state can't contradict the tier. The server
// enforces the same invariant; this just keeps the UI honest.
watch(visibility, (v) => {
  if (v === "PUBLIC") shared.value = true;
});

// Single source of truth for the visibility dropdown's icon + label per tier;
// both the trigger button and the menu items pull from it.
const VISIBILITY_META: Record<Visibility, { label: string; icon: string; description: string }> = {
  PRIVATE: { label: "Private", icon: "i-lucide-lock", description: "Only you can read" },
  PROTECTED: { label: "Protected", icon: "i-lucide-users", description: "Any signed-in user can read" },
  PUBLIC: { label: "Public", icon: "i-lucide-globe", description: "Anyone with the link can read" },
};
const visibilityMenu = computed(() =>
  (["PRIVATE", "PROTECTED", "PUBLIC"] as const).map((v) => ({
    label: VISIBILITY_META[v].label,
    icon: VISIBILITY_META[v].icon,
    description: VISIBILITY_META[v].description,
    onSelect: () => {
      visibility.value = v;
    },
  })),
);

// On large screens the text and its preview sit side by side; on small ones
// this picks which of the two shows.
const mode = ref<"edit" | "preview">("edit");
const editorRef = useTemplateRef<TextareaHost>("editor");
const { displayContent } = useImagePaste(content, editorRef);

// The preview follows the text a beat behind, so typing never waits on a
// re-render (and on Shiki re-highlighting a code block).
const previewSource = ref(content.value);
let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(content, (value) => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewSource.value = value;
  }, 150);
});
onBeforeUnmount(() => clearTimeout(previewTimer));

// ── the toolbar ─────────────────────────────────────────────────────────────
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "meta" : "ctrl";

interface Tool {
  action: MarkdownAction;
  label: string;
  icon: string;
  kbds?: string[];
}
// Groups, drawn with a divider between them.
const TOOLS: Tool[][] = [
  [
    { action: "heading", label: "Heading", icon: "i-lucide-heading" },
    { action: "bold", label: "Bold", icon: "i-lucide-bold", kbds: [MOD, "b"] },
    { action: "italic", label: "Italic", icon: "i-lucide-italic", kbds: [MOD, "i"] },
    { action: "strike", label: "Strikethrough", icon: "i-lucide-strikethrough" },
  ],
  [
    { action: "link", label: "Link", icon: "i-lucide-link", kbds: [MOD, "k"] },
    { action: "code", label: "Inline code", icon: "i-lucide-code" },
    { action: "codeblock", label: "Code block", icon: "i-lucide-square-code" },
    { action: "quote", label: "Quote", icon: "i-lucide-quote" },
  ],
  [
    { action: "bullet", label: "Bulleted list", icon: "i-lucide-list" },
    { action: "numbered", label: "Numbered list", icon: "i-lucide-list-ordered" },
    { action: "task", label: "Checklist", icon: "i-lucide-list-checks" },
  ],
];

function textareaEl(): HTMLTextAreaElement | null {
  const host = editorRef.value;
  return host?.textareaRef ?? host?.$el?.querySelector("textarea") ?? null;
}

/**
 * Apply a toolbar action at the selection. The changed stretch is typed in
 * with insertText where the browser has it, so Ctrl+Z undoes a toolbar edit
 * like any other; where it has not, the text is set outright.
 */
async function apply(action: MarkdownAction) {
  const el = textareaEl();
  if (!el) return;
  const before = displayContent.value;
  const edit = applyMarkdown(before, el.selectionStart, el.selectionEnd, action);
  if (edit.text === before) return;

  let head = 0;
  while (head < before.length && head < edit.text.length && before[head] === edit.text[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < edit.text.length - head &&
    before[before.length - 1 - tail] === edit.text[edit.text.length - 1 - tail]
  )
    tail++;

  el.focus();
  el.setSelectionRange(head, before.length - tail);
  let typed = false;
  try {
    typed = document.execCommand("insertText", false, edit.text.slice(head, edit.text.length - tail));
  } catch {
    typed = false;
  }
  if (!typed || el.value !== edit.text) displayContent.value = edit.text;
  await nextTick();
  el.focus();
  el.setSelectionRange(edit.start, edit.end);
}

// Shortcuts while the editor has focus: save anywhere in the form, and the
// formatting keys in the text. Kept from reaching the window, where ⌘K would
// otherwise open the search.
function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "s") {
    e.preventDefault();
    onSubmit();
    return;
  }
  const inText = e.target instanceof HTMLTextAreaElement;
  const action: MarkdownAction | null = !inText
    ? null
    : key === "b"
      ? "bold"
      : key === "i"
        ? "italic"
        : key === "k"
          ? "link"
          : null;
  if (!action) return;
  e.preventDefault();
  e.stopPropagation();
  void apply(action);
}

const { format, formatting } = useMarkdownFormatter();
const toast = useToast();

// Folder suggestions: every existing folder path plus its parent prefixes.
// Reuses the sidebar's tree (useVault), so no extra HTTP round-trip.
const { tree: notes, loadTree } = useVault();
onMounted(() => void loadTree());

const folderOptions = computed(() => {
  const set = new Set<string>();
  for (const n of notes.value ?? []) {
    if (!n.folder) continue;
    let cumulative = "";
    for (const part of n.folder.split("/").filter(Boolean)) {
      cumulative = cumulative ? `${cumulative}/${part}` : part;
      set.add(cumulative);
    }
  }
  return [...set].sort();
});

async function onFormat() {
  if (!content.value.trim() || formatting.value) return;
  try {
    content.value = await format(content.value);
  } catch (err) {
    toast.add({ title: "Format failed", description: (err as Error).message, color: "error" });
  }
}

function onSubmit() {
  if (!title.value.trim() || props.saving) return;
  emit("submit");
}
</script>

<template>
  <form
    class="flex flex-col gap-3 lg:h-[calc(100dvh-var(--app-header)-3rem)]"
    @submit.prevent="onSubmit"
    @keydown="onKeydown"
  >
    <!-- Title, place and the two ways out. -->
    <div class="surface shrink-0 px-4 py-3 sm:px-6 sm:py-4">
      <div class="flex items-start gap-2 sm:gap-3">
        <UInput
          v-model="title"
          placeholder="Untitled note"
          aria-label="Title"
          variant="none"
          size="xl"
          class="min-w-0 flex-1"
          :ui="{
            base: 'px-0 text-2xl font-black tracking-tight text-highlighted placeholder:text-dimmed sm:text-[1.75rem]',
          }"
        />
        <div class="flex shrink-0 gap-2 pt-1">
          <UButton variant="soft" color="neutral" label="Cancel" @click="emit('cancel')" />
          <UButton
            type="submit"
            color="primary"
            icon="i-lucide-check"
            :label="submitLabel ?? 'Save'"
            :loading="saving"
            :disabled="!title.trim()"
          />
        </div>
      </div>
      <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <!-- Native autocomplete: existing folders are offered as the path is
             typed, and any new path is accepted. Slashes nest. -->
        <UInput
          v-model="folder"
          icon="i-lucide-folder"
          placeholder="Folder, e.g. Programming/Languages"
          aria-label="Folder"
          list="folder-suggestions"
          autocomplete="off"
          variant="soft"
          class="w-full"
        />
        <datalist id="folder-suggestions">
          <option v-for="opt in folderOptions" :key="opt" :value="opt" />
        </datalist>
        <UInput
          v-model="description"
          icon="i-lucide-text"
          placeholder="Short description for previews (optional)"
          aria-label="Description"
          maxlength="500"
          variant="soft"
          class="w-full"
        />
      </div>
    </div>

    <!-- The text, its toolbar and its preview. -->
    <div class="surface flex min-h-[65dvh] flex-1 flex-col overflow-hidden lg:min-h-0">
      <div class="flex items-center gap-1 border-b border-default/60 px-2 py-1.5 sm:px-3">
        <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <template v-for="(group, g) in TOOLS" :key="g">
            <span v-if="g" class="mx-1 h-5 w-px shrink-0 bg-(--ui-border)" aria-hidden="true" />
            <UTooltip v-for="tool in group" :key="tool.action" :text="tool.label" :kbds="tool.kbds">
              <UButton
                :icon="tool.icon"
                :aria-label="tool.label"
                variant="ghost"
                color="neutral"
                size="sm"
                class="shrink-0"
                :disabled="mode === 'preview'"
                @click="apply(tool.action)"
              />
            </UTooltip>
          </template>
        </div>
        <UTooltip text="Tidy the markdown">
          <UButton
            icon="i-lucide-wand-sparkles"
            variant="ghost"
            color="neutral"
            size="sm"
            class="shrink-0"
            aria-label="Format"
            :loading="formatting"
            :disabled="!displayContent.trim() || mode === 'preview'"
            @click="onFormat"
          />
        </UTooltip>
        <!-- Small screens: write or look. -->
        <div class="flex shrink-0 gap-0.5 rounded-full bg-elevated p-0.5 lg:hidden" role="tablist">
          <button
            v-for="m in (['edit', 'preview'] as const)"
            :key="m"
            type="button"
            role="tab"
            :aria-selected="mode === m"
            class="rounded-full px-3 py-1 text-xs font-bold transition-colors"
            :class="mode === m ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
            @click="mode = m"
          >
            {{ m === "edit" ? "Write" : "Preview" }}
          </button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 lg:grid-cols-2 lg:divide-x lg:divide-default/60">
        <div class="min-h-0" :class="mode === 'preview' ? 'hidden lg:block' : ''">
          <UTextarea
            ref="editor"
            v-model="displayContent"
            placeholder="Write your note in markdown…"
            aria-label="Content"
            variant="none"
            class="h-full w-full [&>div]:h-full"
            :ui="{ base: 'h-full min-h-[50dvh] resize-none px-4 py-4 font-mono text-sm leading-relaxed sm:px-5 lg:min-h-0' }"
          />
        </div>
        <div class="min-h-0 overflow-y-auto px-5 py-4 sm:px-7" :class="mode === 'edit' ? 'hidden lg:block' : ''">
          <p class="mb-2 text-[0.7rem] font-extrabold uppercase tracking-wider text-dimmed">Preview</p>
          <div v-if="previewSource.trim()" class="prose max-w-none text-default">
            <MarkdownPreview :value="previewSource" />
          </div>
          <p v-else class="text-sm text-muted italic">Nothing to preview yet.</p>
        </div>
      </div>

      <!-- Who can read it. -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-default/60 px-3 py-2 sm:px-4">
        <UDropdownMenu :items="visibilityMenu" :ui="{ content: 'w-60' }">
          <UButton
            variant="soft"
            color="neutral"
            size="sm"
            :icon="VISIBILITY_META[visibility].icon"
            :label="VISIBILITY_META[visibility].label"
            trailing-icon="i-lucide-chevron-down"
          />
        </UDropdownMenu>
        <!-- Share-by-link. Orthogonal to the tier, except that PUBLIC forces
             it on (and disables it): a public note is shareable by definition. -->
        <USwitch v-model="shared" size="sm" label="Shared link" :disabled="visibility === 'PUBLIC'" />
        <span class="ml-auto hidden text-xs text-muted sm:inline">
          Markdown · <UKbd :value="MOD" size="sm" /> <UKbd value="s" size="sm" /> saves
        </span>
      </div>
    </div>
  </form>
</template>
