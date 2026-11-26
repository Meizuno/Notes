import { describe, expect, it } from "vitest";

import { grammarOf, LANGUAGE_NAMES, loadHighlight } from "../highlight";

// nuxt.config.ts `mdc.highlight.langs` in the Nuxt app.
/** The text of highlighted HTML: tags dropped, entities (named or numeric) decoded. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const NUXT_LANGS = [
  "typescript", "javascript", "tsx", "jsx", "vue",
  "python", "bash", "shell", "json", "yaml",
  "html", "css", "scss", "sql",
  "markdown", "md", "diff", "go", "rust",
  "dockerfile", "ini", "toml",
];

describe("the highlighter's languages", () => {
  it("are the Nuxt app's, every one of them", () => {
    for (const lang of NUXT_LANGS) expect(grammarOf(lang), lang).not.toBeNull();
  });

  it("read the first word of a fence's info string, in any case", () => {
    expect(grammarOf("TS")).toBe("typescript");
    expect(grammarOf("ts title=a.ts {1,3}")).toBe("typescript");
    expect(grammarOf("")).toBeNull();
    expect(grammarOf(undefined)).toBeNull();
    expect(grammarOf("brainfuck")).toBeNull();
  });

  it("only use names their grammar really registers", async () => {
    for (const [name, grammar] of Object.entries(LANGUAGE_NAMES)) {
      const mod = (await import(`shiki/langs/${grammar}.mjs`)) as {
        default: { name: string; aliases?: string[] }[];
      };
      const main = mod.default[mod.default.length - 1]!;
      expect([main.name, ...(main.aliases ?? []), grammar], name).toContain(name);
    }
  });

  it("colour a block with both themes and keep its text", async () => {
    const highlight = await loadHighlight(["py", "dockerfile"]);
    for (const [info, code] of [
      ["py", "def f(x):\n    return x * 2"],
      ["dockerfile", "FROM node:22\nRUN echo \"<hi>\" && true"],
    ] as const) {
      const inner = highlight(code, info);
      expect(inner).toContain('class="line"');
      expect(inner).toContain("--shiki-dark:");
      // Really tokenised — plain text would be one colour throughout.
      expect(new Set(inner.match(/--shiki-light:#[0-9a-f]+/gi)).size, info).toBeGreaterThan(1);
      expect(textOf(inner)).toBe(code);
    }
  });

  it("fall back to plain text for a language it does not have", async () => {
    const highlight = await loadHighlight([]);
    const inner = highlight("<not> & code", "cobol");
    expect(inner).not.toContain("<not>");
    expect(textOf(inner)).toBe("<not> & code");
  });
});
