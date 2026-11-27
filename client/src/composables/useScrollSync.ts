import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

import { buildAnchors, previewScrollFor, type Anchor } from "../lib/scroll-sync";

// The editor's preview scrolls with the text, and only with it: the wheel over
// the preview scrolls the text, which carries the preview along. On while the
// two panes sit side by side (`query`); on a narrow screen the preview is a
// page of its own and scrolls as one.
//
// Anchors pair where each block starts in the text with where its render
// starts in the preview (MarkdownPreview marks each block with data-line). The
// text side is measured on a hidden copy of the textarea, so wrapped lines
// count as the lines they take up.

interface Options {
  /** The textarea, once it exists. */
  editor: () => HTMLTextAreaElement | null;
  /** The preview's scroll container: positioned, holding [data-line] blocks. */
  pane: Ref<HTMLElement | null>;
  /** The textarea's text; a change re-measures (wrapping may have moved). */
  text: Ref<string>;
  /** When the panes are side by side. */
  query?: string;
}

const MIRRORED = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "tabSize",
  "wordBreak",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

export function useScrollSync({ editor, pane, text, query = "(min-width: 64rem)" }: Options) {
  /** Whether the two scroll as one now. The pane drops its own scrollbar. */
  const active = ref(false);

  let anchors: Anchor[] = [];
  let mirror: HTMLDivElement | null = null;
  let measureFrame = 0;
  let syncFrame = 0;
  let measureTimer: ReturnType<typeof setTimeout> | undefined;
  let attached: { ed: HTMLTextAreaElement; pane: HTMLElement } | null = null;
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => scheduleMeasure()) : null;

  /** Where each wanted line starts in the textarea, as a scrollTop. */
  function editorTops(ed: HTMLTextAreaElement, lines: number[]): number[] {
    const style = getComputedStyle(ed);
    mirror ??= document.body.appendChild(document.createElement("div"));
    const m = mirror.style;
    for (const prop of MIRRORED) m[prop] = style[prop];
    m.position = "absolute";
    m.visibility = "hidden";
    m.pointerEvents = "none";
    m.top = "0";
    m.left = "-99999px";
    m.boxSizing = "content-box";
    m.border = "0";
    m.whiteSpace = "pre-wrap";
    m.overflowWrap = "break-word";
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    m.width = `${Math.max(0, ed.clientWidth - padX)}px`;

    const value = ed.value;
    const starts: number[] = [];
    let line = 0;
    let at = 0;
    for (const wanted of lines) {
      while (line < wanted) {
        const nl = value.indexOf("\n", at);
        if (nl === -1) break;
        at = nl + 1;
        line++;
      }
      starts.push(at);
    }

    mirror.textContent = "";
    const markers: HTMLSpanElement[] = [];
    let from = 0;
    for (const start of starts) {
      mirror.append(value.slice(from, start));
      const marker = document.createElement("span");
      marker.textContent = "​";
      mirror.append(marker);
      markers.push(marker);
      from = start;
    }
    mirror.append(value.slice(from));
    const padTop = parseFloat(style.paddingTop) || 0;
    return markers.map((marker) => marker.offsetTop - padTop);
  }

  function measure() {
    if (!attached) return;
    const { ed, pane: box } = attached;
    const blocks = Array.from(box.querySelectorAll<HTMLElement>("[data-line]"));
    const lines = blocks.map((b) => Number(b.dataset.line) || 0);
    const padTop = parseFloat(getComputedStyle(box).paddingTop) || 0;
    anchors = buildAnchors(
      editorTops(ed, lines),
      blocks.map((b) => b.offsetTop - padTop),
      Math.max(0, ed.scrollHeight - ed.clientHeight),
      Math.max(0, box.scrollHeight - box.clientHeight),
    );
  }

  function sync() {
    if (!attached) return;
    attached.pane.scrollTop = previewScrollFor(anchors, attached.ed.scrollTop);
  }

  function scheduleMeasure() {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      measure();
      sync();
    });
  }

  function onEditorScroll() {
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(sync);
  }

  // The preview has no scroll of its own: the wheel over it moves the text.
  function onPaneWheel(e: WheelEvent) {
    if (!attached || e.ctrlKey) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? attached.ed.clientHeight : 1;
    attached.ed.scrollTop += e.deltaY * unit;
  }

  function attach() {
    const ed = editor();
    const box = pane.value;
    if (!ed || !box || attached) return;
    attached = { ed, pane: box };
    ed.addEventListener("scroll", onEditorScroll, { passive: true });
    box.addEventListener("wheel", onPaneWheel, { passive: false });
    resize?.observe(ed);
    resize?.observe(box);
    if (box.firstElementChild) resize?.observe(box.firstElementChild);
    scheduleMeasure();
  }

  function detach() {
    if (!attached) return;
    attached.ed.removeEventListener("scroll", onEditorScroll);
    attached.pane.removeEventListener("wheel", onPaneWheel);
    resize?.disconnect();
    attached = null;
  }

  // The text changed: the preview re-renders a beat later (its own debounce),
  // and the wrapping in the textarea may have moved — measure once both settle.
  watch(
    text,
    () => {
      clearTimeout(measureTimer);
      measureTimer = setTimeout(scheduleMeasure, 220);
    },
    { flush: "post" },
  );

  let media: MediaQueryList | null = null;
  const onMedia = () => {
    active.value = !!media?.matches;
  };
  watch(active, (on) => (on ? attach() : detach()), { flush: "post" });

  onMounted(() => {
    if (typeof window.matchMedia !== "function") return;
    media = window.matchMedia(query);
    media.addEventListener("change", onMedia);
    onMedia();
  });

  onBeforeUnmount(() => {
    media?.removeEventListener("change", onMedia);
    detach();
    clearTimeout(measureTimer);
    cancelAnimationFrame(measureFrame);
    cancelAnimationFrame(syncFrame);
    mirror?.remove();
    mirror = null;
  });

  return { active };
}
