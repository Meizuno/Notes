import { withBase } from "./base";
import { TASK_ATTR } from "./sanitize";

// How rendered markdown is dressed — the Nuxt app's components/prose/*.
//
// MDC drew every markdown element through a Prose component, and the app
// overrode most of them; each one was a tag with a fixed set of Tailwind
// classes. Here the markdown arrives as sanitized HTML, so the same classes are
// put on the same tags after sanitizing (`decorate`), and the few components
// that did more than add classes — the link, the code block with its copy
// button, the grid table — are rebuilt as DOM around the element. main.css
// then layers the Nord palette over all of it under `.prose`, exactly as it
// did over the components.
//
// Elements the app did not override kept Nuxt UI's prose look (em, thead,
// tbody, tr) or MDC's plain one (h5, h6); they are listed with those classes.

export const PROSE = {
  linkInternal:
    "font-semibold text-primary underline decoration-primary/35 underline-offset-[3px] hover:decoration-primary",
  linkExternal:
    "font-semibold text-primary underline decoration-dotted decoration-primary/45 underline-offset-[3px] hover:decoration-solid hover:decoration-primary",
  blockquote: "my-4 border-s-2 border-primary/60 ps-4 italic text-toned",
  code: "rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[0.88em] text-highlighted",
  h1: "text-[1.6rem] leading-tight font-black tracking-tight mt-8 mb-2 text-highlighted",
  h2: "text-xl leading-snug font-extrabold tracking-tight mt-7 mb-2 text-highlighted",
  h3: "text-lg font-bold mt-5 mb-1.5 text-highlighted",
  h4: "text-base font-bold mt-4 mb-1 text-highlighted",
  hr: "my-8 border-t border-default",
  img: "my-4 rounded-2xl max-w-full",
  li: "my-1 ps-1 leading-relaxed",
  ol: "my-3 ps-5 list-decimal marker:text-primary marker:font-bold",
  p: "my-3 leading-relaxed",
  strong: "font-bold text-highlighted",
  ul: "my-3 ps-5 list-disc marker:text-primary",
  // prose/pre.global.vue
  preWrap: "relative my-4 max-w-full min-w-0",
  copy: "kb-copy absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-full bg-default/80 p-1.5 text-muted shadow-sm hover:text-highlighted",
  pre: "p-3 sm:p-4 text-sm leading-relaxed rounded-2xl border border-default bg-elevated/60 overflow-x-auto max-w-full min-w-0 whitespace-pre",
  // prose/table.global.vue, td, th — and Nuxt UI's thead / tr
  tableWrap: "my-4 overflow-x-auto rounded-2xl border border-default max-w-full min-w-0",
  table: "prose-grid-table text-sm",
  thead: "bg-muted",
  tr: "[&:first-child>th:first-child]:rounded-ss-2xl [&:first-child>th:last-child]:rounded-se-2xl [&:last-child>td:first-child]:rounded-es-2xl [&:last-child>td:last-child]:rounded-ee-2xl",
  th: "px-4 py-2.5 text-start text-xs font-extrabold uppercase tracking-wide text-muted bg-elevated border-b border-default whitespace-nowrap md:whitespace-normal",
  td: "px-4 py-2.5 align-top border-t border-default/60 tabular-nums whitespace-nowrap md:whitespace-normal",
} as const;

const BY_TAG: Record<string, string> = {
  BLOCKQUOTE: PROSE.blockquote,
  H1: PROSE.h1,
  H2: PROSE.h2,
  H3: PROSE.h3,
  H4: PROSE.h4,
  HR: PROSE.hr,
  IMG: PROSE.img,
  LI: PROSE.li,
  OL: PROSE.ol,
  P: PROSE.p,
  STRONG: PROSE.strong,
  UL: PROSE.ul,
  THEAD: PROSE.thead,
  TR: PROSE.tr,
  TH: PROSE.th,
  TD: PROSE.td,
};

/** The route an internal link navigates to — set on the <a> by `decorate`. */
export const ROUTE_ATTR = "data-kb-route";

export type LinkKind = "internal" | "anchor" | "external" | "none";

/**
 * Which kind of link an href is. Internal is a root-absolute path of this app
 * ("/slug", "/new?title=x"); "//host" and "/\host" are not — a browser reads
 * both as another site. "#x" stays on the page. Everything else (http(s),
 * mailto, a relative "x/y") is external and opens in a new tab.
 */
export function linkKind(href: string | null): LinkKind {
  if (!href) return "none";
  if (/^\/(?![/\\])/.test(href)) return "internal";
  if (href.startsWith("#")) return "anchor";
  return "external";
}

// The copy / copied icons (lucide copy and check), inline as in
// prose/pre.global.vue so they need nothing from the icon bundle.
const COPY_ICONS =
  '<svg class="kb-copy-idle" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>' +
  '<svg class="kb-copy-done" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

function addClass(el: Element, classes: string) {
  el.classList.add(...classes.split(" "));
}

function decorateLink(a: HTMLAnchorElement) {
  const href = a.getAttribute("href");
  const kind = linkKind(href);
  a.removeAttribute(ROUTE_ATTR);
  if (kind === "internal" && href) {
    // The browser's address carries the base the app is served from; the
    // router is handed the bare path and adds the base itself.
    a.setAttribute("href", withBase(href));
    a.setAttribute(ROUTE_ATTR, href);
    a.removeAttribute("target");
    a.removeAttribute("rel");
    addClass(a, PROSE.linkInternal);
  } else if (kind === "anchor") {
    a.removeAttribute("target");
    addClass(a, PROSE.linkInternal);
  } else {
    // External — and an <a> whose href the sanitizer took away, which stays
    // an inert, styled anchor. The href is kept: the Nuxt app's prose/a
    // dropped it, so its external links opened nothing.
    if (kind === "external") {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
    addClass(a, PROSE.linkExternal);
  }
}

function decoratePre(pre: HTMLElement, doc: Document) {
  // Whatever classes the <pre> came with (Shiki's) belong to the wrapper, as
  // they did when MDC passed them through to ProsePre's root element.
  const wrap = doc.createElement("div");
  wrap.className = pre.className;
  addClass(wrap, PROSE.preWrap);
  pre.className = PROSE.pre;

  const button = doc.createElement("button");
  button.type = "button";
  button.className = PROSE.copy;
  button.setAttribute("aria-label", "Copy code");
  button.setAttribute("title", "Copy code");
  button.setAttribute("data-kb-copy", "");
  button.innerHTML = COPY_ICONS;

  pre.replaceWith(wrap);
  wrap.append(button, pre);
}

function decorateTable(table: HTMLTableElement, doc: Document) {
  const wrap = doc.createElement("div");
  addClass(wrap, PROSE.tableWrap);
  addClass(table, PROSE.table);
  table.setAttribute("role", "table");
  // The column count the grid needs, from the first row — prose/table counted
  // it on mount; a rendered table's shape is known now.
  const firstRow = table.querySelector("tr");
  table.style.setProperty("--prose-cols", String(firstRow ? firstRow.children.length : 1));
  table.replaceWith(wrap);
  wrap.append(table);
}

function taskBox(placeholder: Element, nonce: string, interactive: boolean, doc: Document) {
  const value = placeholder.getAttribute(TASK_ATTR) ?? "";
  if (!nonce || !value.startsWith(`${nonce}:`)) {
    placeholder.remove();
    return;
  }
  const input = doc.createElement("input");
  input.type = "checkbox";
  if (value.endsWith(":1")) {
    input.checked = true;
    input.setAttribute("checked", "");
  }
  // GFM renders task boxes disabled; the note view strips that so they toggle
  // (NoteContent's enableCheckboxes), the editor's preview keeps it.
  if (!interactive) input.setAttribute("disabled", "");
  placeholder.replaceWith(input);
}

export interface DecorateOptions {
  /** The nonce the renderer stamped on its own task placeholders. */
  nonce: string;
  /** Task checkboxes can be ticked (the note view) or are inert (preview). */
  interactiveTasks: boolean;
}

/** Dress a sanitized fragment as the prose components did, in place. */
export function decorate(root: DocumentFragment, opts: DecorateOptions): void {
  const doc = root.ownerDocument;
  // A snapshot: wrapping a table or a <pre> moves it, and a live walk would
  // visit it twice.
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName;
    if (tag === "A") decorateLink(el as HTMLAnchorElement);
    else if (tag === "PRE") decoratePre(el as HTMLElement, doc);
    else if (tag === "TABLE") decorateTable(el as HTMLTableElement, doc);
    else if (tag === "CODE") {
      // Inline code only: the <code> inside a block is MDC's `__ignoreMap`
      // plain element, styled by the <pre> around it.
      if (!el.closest("pre")) addClass(el, PROSE.code);
    } else if (tag === "SPAN" && el.hasAttribute(TASK_ATTR)) {
      taskBox(el, opts.nonce, opts.interactiveTasks, doc);
    } else {
      const classes = BY_TAG[tag];
      if (classes) addClass(el, classes);
      // MDC's ProseImg: a root-absolute image is served under the app's base.
      if (tag === "IMG") {
        const src = el.getAttribute("src");
        if (src && /^\/(?![/\\])/.test(src)) el.setAttribute("src", withBase(src));
      }
    }
  }
}

// ── Behaviour, delegated from the element the HTML is rendered into ─────────

const copiedTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

async function copyCode(button: HTMLElement) {
  const code = button.parentElement?.querySelector("pre")?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // Clipboard unavailable (insecure context / denied) — no-op, as before.
    return;
  }
  button.classList.add("is-copied");
  button.setAttribute("aria-label", "Copied");
  button.setAttribute("title", "Copied");
  const previous = copiedTimers.get(button);
  if (previous) clearTimeout(previous);
  copiedTimers.set(
    button,
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.setAttribute("aria-label", "Copy code");
      button.setAttribute("title", "Copy code");
    }, 1500),
  );
}

/**
 * A click inside rendered markdown: the copy button copies, an internal link
 * navigates in the app (unless a modifier or another button asks for the
 * browser's own behaviour — a new tab, a download). Everything else is left to
 * the browser: external links open their new tab, anchors scroll.
 */
export function handleProseClick(e: MouseEvent, navigate: (path: string) => void): void {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;

  const copy = target.closest<HTMLElement>("[data-kb-copy]");
  if (copy) {
    e.preventDefault();
    void copyCode(copy);
    return;
  }

  const link = target.closest<HTMLAnchorElement>(`a[${ROUTE_ATTR}]`);
  if (!link) return;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(link.getAttribute(ROUTE_ATTR) ?? "/");
}
