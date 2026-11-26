import { Lexer, Parser, Renderer, walkTokens, type MarkedOptions, type Token, type Tokens } from "marked";

import type { Highlight } from "./highlight";
import { COLLAPSED_RE } from "./markdown-source";
import { decorate } from "./prose";
import { sanitize, TASK_ATTR } from "./sanitize";

// Markdown → safe HTML, in the Nuxt app's look.
//
// MDC is Nuxt-only, so the note body is parsed with `marked` (GitHub-flavoured,
// as remark-gfm was) and rendered in three steps:
//   1. marked renders HTML, with a few renderer overrides: heading ids, the
//      GFM task-list classes, task checkboxes as placeholders the sanitizer
//      will only keep from this render, and code blocks through Shiki;
//   2. DOMPurify sanitizes all of it (lib/sanitize.ts) — a note's raw HTML
//      included;
//   3. the result is dressed as the prose components dressed it
//      (lib/prose.ts): classes, the code block's copy button, the grid table,
//      link targets, and the checkboxes put back.
//
// Lexing is separate from rendering so the note view can split the top-level
// blocks into heading sections (markdown-sections.ts) and render each slice on
// its own, which is how the folds work.

const OPTIONS: MarkedOptions = {
  gfm: true,
  // CommonMark line breaks, as remark: a single newline is a space, not <br>.
  breaks: false,
};

// Heading ids, assigned once per document so two "Notes" headings in
// different sections still get distinct anchors. Kept beside the tokens
// rather than written into them.
const headingIds = new WeakMap<Token, string>();

/** The text a heading reads as: inline markup and raw HTML (the fold marker) dropped. */
function plainText(tokens: Token[] | undefined): string {
  let out = "";
  for (const t of tokens ?? []) {
    if (t.type === "html") continue;
    if ("tokens" in t && Array.isArray(t.tokens) && t.tokens.length) out += plainText(t.tokens as Token[]);
    else if ("text" in t && typeof t.text === "string") out += t.text;
  }
  return out;
}

/** GitHub-style heading slug: lower case, punctuation dropped, spaces → "-". */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function assignHeadingIds(tokens: Token[]) {
  const seen = new Map<string, number>();
  walkTokens(tokens, (t) => {
    if (t.type !== "heading") return;
    const base = slugify(plainText((t as Tokens.Heading).tokens));
    if (!base) return;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    headingIds.set(t, n ? `${base}-${n}` : base);
  });
}

/**
 * Parse a note into its top-level blocks. Never throws: anything unparseable
 * becomes one plain paragraph. Blank-line (`space`) and link-definition tokens
 * render to nothing and are dropped, so a heading section holds only blocks
 * that draw something.
 */
export function lexMarkdown(src: string): Token[] {
  let tokens: Token[];
  try {
    tokens = Lexer.lex(src, OPTIONS);
  } catch {
    tokens = [{ type: "paragraph", raw: src, text: src, tokens: [{ type: "text", raw: src, text: src }] } as Token];
  }
  assignHeadingIds(tokens);
  return tokens.filter((t) => t.type !== "space" && t.type !== "def");
}

/** Every fenced block's info string — what the highlighter has to load for. */
export function codeInfos(tokens: Token[]): string[] {
  const infos: string[] = [];
  walkTokens(tokens, (t) => {
    if (t.type === "code") infos.push((t as Tokens.Code).lang ?? "");
  });
  return infos;
}

/**
 * Tick or clear the Nth task checkbox (document order) in already-lexed
 * blocks, so a later render — Shiki arriving, say — draws the box as the
 * reader left it rather than as the note was loaded. False when there is no
 * Nth task.
 */
export function setTaskChecked(tokens: Token[], n: number, checked: boolean): boolean {
  let count = 0;
  let found = false;
  walkTokens(tokens, (t) => {
    if (t.type !== "checkbox" || found) return;
    if (count++ === n) {
      (t as Tokens.Checkbox).checked = checked;
      found = true;
    }
  });
  return found;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class NotesRenderer extends Renderer {
  constructor(
    private readonly nonce: string,
    private readonly highlight: Highlight | null,
  ) {
    super();
  }

  override code({ text, lang }: Tokens.Code): string {
    if (this.highlight) {
      // Shiki's classes travel on the <pre>; decorate() moves them to the
      // wrapper, where MDC's ProsePre put them.
      return `<pre class="shiki shiki-themes github-light github-dark"><code>${this.highlight(text, lang)}</code></pre>\n`;
    }
    // Not loaded yet (or failed): the same box, uncoloured.
    return `<pre><code>${escapeHtml(text.replace(/\n$/, ""))}</code></pre>\n`;
  }

  override heading(token: Tokens.Heading): string {
    const id = headingIds.get(token);
    // The fold marker is state, not content: never rendered.
    const inline = token.tokens.filter((t) => !(t.type === "html" && COLLAPSED_RE.test(t.raw)));
    const attr = id ? ` id="${escapeHtml(id)}"` : "";
    return `<h${token.depth}${attr}>${this.parser.parseInline(inline).trim()}</h${token.depth}>\n`;
  }

  // remark-gfm's markup for task lists: the list and its items carry classes
  // main.css styles (no bullet, a bigger box).
  override list(token: Tokens.List): string {
    const tag = token.ordered ? "ol" : "ul";
    const start = token.ordered && token.start !== "" && token.start !== 1 ? ` start="${token.start}"` : "";
    const cls = token.items.some((i) => i.task) ? ' class="contains-task-list"' : "";
    let body = "";
    for (const item of token.items) body += this.listitem(item);
    return `<${tag}${start}${cls}>\n${body}</${tag}>\n`;
  }

  override listitem(item: Tokens.ListItem): string {
    const cls = item.task ? ' class="task-list-item"' : "";
    return `<li${cls}>${this.parser.parse(item.tokens)}</li>\n`;
  }

  // A placeholder only this render's sanitize keeps; decorate() turns it into
  // the <input>. Raw HTML cannot add a checkbox: inputs are forbidden.
  override checkbox({ checked }: Tokens.Checkbox): string {
    return `<span ${TASK_ATTR}="${this.nonce}:${checked ? 1 : 0}"></span> `;
  }
}

function makeNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RenderOptions {
  /** Shiki, once it has loaded; until then code blocks are plain. */
  highlight?: Highlight | null;
  /** Task checkboxes can be ticked — the note view. The preview keeps them disabled. */
  interactiveTasks?: boolean;
}

/** Render lexed blocks to sanitized, decorated HTML for v-html. */
export function renderTokens(tokens: Token[], opts: RenderOptions = {}): string {
  if (!tokens.length) return "";
  const nonce = makeNonce();
  const renderer = new NotesRenderer(nonce, opts.highlight ?? null);
  let html: string;
  try {
    html = new Parser({ ...OPTIONS, renderer }).parse(tokens);
  } catch {
    html = `<p>${escapeHtml(tokens.map((t) => t.raw).join(""))}</p>`;
  }
  const fragment = sanitize(html, nonce);
  decorate(fragment, { nonce, interactiveTasks: !!opts.interactiveTasks });
  const host = document.createElement("div");
  host.append(fragment);
  return host.innerHTML;
}

/** Markdown source straight to HTML — the editor's preview. */
export function renderMarkdown(src: string, opts: RenderOptions = {}): string {
  return renderTokens(lexMarkdown(src), opts);
}
