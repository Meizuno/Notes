import type { HighlighterCore, LanguageRegistration } from "shiki/core";

// Syntax highlighting for code blocks — Shiki, as MDC did it in the Nuxt app:
// the JavaScript regex engine, github-light / github-dark with both colours
// kept as CSS variables (`defaultColor: false`; main.css picks one per mode),
// and exactly the languages nuxt.config.ts listed. A block in any other
// language renders as plain text, as MDC fell back to.
//
// Nothing here loads until a note with a code block is opened: Shiki's core,
// the two themes and each grammar are separate chunks, fetched on first use.

type Grammar = () => Promise<{ default: LanguageRegistration[] }>;

// nuxt.config.ts `mdc.highlight.langs`, by Shiki grammar. `bash` and `shell`
// were two names for one grammar there, as were `markdown` and `md`.
const GRAMMARS: Record<string, Grammar> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
};

// Every name a fence may use for one of those grammars: its own name and the
// aliases the grammar registers (which MDC accepted too, once it was loaded).
export const LANGUAGE_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.keys(GRAMMARS).map((g) => [g, g])),
  ts: "typescript",
  cts: "typescript",
  mts: "typescript",
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  py: "python",
  bash: "shellscript",
  sh: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  docker: "dockerfile",
  properties: "ini",
};

/** The grammar a fence's info string asks for, or null for plain text. */
export function grammarOf(info: string | null | undefined): string | null {
  const name = (info ?? "").trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return LANGUAGE_NAMES[name] ?? null;
}

/** Highlight one block: the inner HTML of its <code> (one span.line per line). */
export type Highlight = (code: string, info: string | null | undefined) => string;

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let core: Promise<HighlighterCore> | null = null;

function highlighter(): Promise<HighlighterCore> {
  core ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ]);
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  // A failed load (offline, a deploy replaced the chunks) may be retried later.
  core.catch(() => {
    core = null;
  });
  return core;
}

const CODE_INNER = /<code[^>]*>([\s\S]*)<\/code>\s*<\/pre>\s*$/;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Load Shiki with the grammars these fences need (unknown ones are ignored) and
 * return a synchronous highlighter for them. Grammars already loaded are not
 * fetched again.
 */
export async function loadHighlight(infos: Iterable<string | null | undefined>): Promise<Highlight> {
  const hl = await highlighter();
  const wanted = new Set<string>();
  for (const info of infos) {
    const g = grammarOf(info);
    if (g) wanted.add(g);
  }
  const loaded = new Set(hl.getLoadedLanguages());
  await Promise.all(
    [...wanted]
      .filter((g) => !loaded.has(g))
      .map(async (g) => {
        const grammar = GRAMMARS[g];
        if (grammar) await hl.loadLanguage((await grammar()).default);
      }),
  );

  return (code, info) => {
    const g = grammarOf(info);
    // Loaded grammars register their aliases, so the fence's own word works.
    const lang = g && hl.getLoadedLanguages().includes(g) ? g : "text";
    try {
      const html = hl.codeToHtml(code.replace(/\s+$/, ""), { lang, themes: THEMES, defaultColor: false });
      const inner = CODE_INNER.exec(html)?.[1];
      if (inner !== undefined) return inner;
    } catch {
      // A grammar that chokes on this block: plain text, as MDC fell back to.
    }
    return escapeHtml(code.replace(/\n$/, ""));
  };
}
