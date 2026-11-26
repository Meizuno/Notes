// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Token } from "marked";

import { loadHighlight, type Highlight } from "../highlight";
import { codeInfos, lexMarkdown, renderMarkdown, renderTokens, setTaskChecked, slugify } from "../markdown";
import { buildSectionTree } from "../markdown-sections";
import { getCollapsedIndices } from "../markdown-source";
import { handleProseClick, linkKind, PROSE, ROUTE_ATTR } from "../prose";
import { sanitize } from "../sanitize";

/** Render, then parse the result back into a DOM to ask questions of it. */
function dom(src: string, opts: Parameters<typeof renderMarkdown>[1] = {}): HTMLDivElement {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(src, opts);
  return host;
}

describe("sanitizing a note's markdown", () => {
  it("drops script, style and the embedding elements, keeping the text around them", () => {
    const html = renderMarkdown(
      [
        "before",
        "",
        "<script>alert(1)</script>",
        "<style>body{display:none}</style>",
        '<iframe src="https://evil.example"></iframe>',
        '<object data="x.swf"></object><embed src="x.swf">',
        '<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example">',
        '<link rel="stylesheet" href="https://evil.example/x.css">',
        "",
        "after",
      ].join("\n"),
    );
    for (const tag of ["<script", "<style", "<iframe", "<object", "<embed", "<base", "<meta", "<link"]) {
      expect(html).not.toContain(tag);
    }
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("drops forms and every form control", () => {
    const host = dom(
      '<form action="https://evil.example"><input name="q"><textarea></textarea><select><option>a</option></select><button>go</button></form>',
    );
    expect(host.querySelector("form, input, textarea, select, option, button")).toBeNull();
  });

  it("drops on* attributes", () => {
    const host = dom('<img src="/x.png" onerror="alert(1)"> <p onclick="alert(2)">hi</p> <a href="/x" onmouseover="alert(3)">x</a>');
    for (const el of Array.from(host.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.name.startsWith("on")).toBe(false);
    }
  });

  it("keeps only http(s), mailto and relative URLs", () => {
    const host = dom(
      [
        "[js](javascript:alert(1))",
        '<a href="JaVaScRiPt:alert(1)">js2</a>',
        '<a href="data:text/html,hello">data</a>',
        '<a href="vbscript:msgbox">vb</a>',
        '<a href="tel:+420123">tel</a>',
        '<a href="ftp://example.com/f">ftp</a>',
        "[web](https://example.com/a) [plain](http://example.com/b) [mail](mailto:a@example.com)",
        "[rel](/some-note) [frag](#part) [dot](./x) [bare](other/page)",
      ].join("\n\n"),
    );
    const hrefs = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "https://example.com/a",
      "http://example.com/b",
      "mailto:a@example.com",
      "/some-note",
      "#part",
      "./x",
      "other/page",
    ]);
  });

  it("keeps a pasted data:image picture, and no other data: URI", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const host = dom(`![image](${png})\n\n<img src="data:text/html;base64,PHNjcmlwdD4=">`);
    const srcs = Array.from(host.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toEqual([png, null]);
  });

  it("does not let raw HTML forge a task checkbox", () => {
    const host = dom('<span data-kb-task="guess:1"></span> <input type="checkbox" checked>');
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("[data-kb-task]")).toBeNull();
  });

  it("refuses data attributes from raw HTML, so a link cannot claim a route", () => {
    const host = dom('<a href="https://evil.example" data-kb-route="/fine">x</a>');
    const a = host.querySelector("a")!;
    expect(a.hasAttribute(ROUTE_ATTR)).toBe(false);
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("drops HTML comments, the fold marker among them", () => {
    expect(renderMarkdown("<!-- hidden -->\n\ntext")).not.toContain("hidden");
    const sanitized = sanitize("<p>a<!-- b --></p>");
    expect(sanitized.childNodes[0]!.childNodes).toHaveLength(1);
  });
});

describe("links", () => {
  it("routes an internal link through the app, keeping its href", () => {
    const a = dom("[Other note](/other-note)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("/other-note");
    expect(a.getAttribute(ROUTE_ATTR)).toBe("/other-note");
    expect(a.hasAttribute("target")).toBe(false);
    expect(a.className).toContain(PROSE.linkInternal);
  });

  it("opens an external link in a new tab WITH its href", () => {
    for (const src of ["[site](https://example.com/page?q=1)", "https://example.com/page?q=1"]) {
      const a = dom(src).querySelector("a")!;
      expect(a.getAttribute("href")).toBe("https://example.com/page?q=1");
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.hasAttribute(ROUTE_ATTR)).toBe(false);
      expect(a.className).toContain(PROSE.linkExternal);
    }
  });

  it("treats a raw-HTML <a> the same way", () => {
    const host = dom('<a href="/inside">in</a> <a href="https://example.com" target="_self">out</a>');
    const [inside, outside] = Array.from(host.querySelectorAll("a"));
    expect(inside!.getAttribute(ROUTE_ATTR)).toBe("/inside");
    expect(outside!.getAttribute("target")).toBe("_blank");
  });

  it("never mistakes another host for an internal path", () => {
    expect(linkKind("/note")).toBe("internal");
    expect(linkKind("/new?title=x")).toBe("internal");
    expect(linkKind("//evil.example/x")).toBe("external");
    expect(linkKind("/\\evil.example")).toBe("external");
    expect(linkKind("#part")).toBe("anchor");
    expect(linkKind("mailto:a@example.com")).toBe("external");
    expect(linkKind(null)).toBe("none");
    const a = dom("[x](//evil.example/x)").querySelector("a")!;
    expect(a.hasAttribute(ROUTE_ATTR)).toBe(false);
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("leaves an in-page anchor in the page", () => {
    const a = dom("[jump](#part)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("#part");
    expect(a.hasAttribute("target")).toBe(false);
    expect(a.hasAttribute(ROUTE_ATTR)).toBe(false);
  });

  it("navigates on a plain click of an internal link, and only then", () => {
    const host = dom("[in](/target-note) [out](https://example.com)");
    document.body.append(host);
    const [inside, outside] = Array.from(host.querySelectorAll("a"));
    const navigate = vi.fn();
    host.addEventListener("click", (e) => handleProseClick(e, navigate));
    // What the app left the browser to do, recorded before the test stops the
    // browser doing it (jsdom cannot navigate).
    const leftToBrowser: boolean[] = [];
    const record = (e: Event) => {
      leftToBrowser.push(!e.defaultPrevented);
      e.preventDefault();
    };
    document.addEventListener("click", record);

    inside!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(navigate).toHaveBeenCalledWith("/target-note");

    // A modifier asks for the browser's own behaviour (a new tab).
    inside!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));

    outside!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    expect(leftToBrowser).toEqual([false, true, true]);
    expect(navigate).toHaveBeenCalledTimes(1);
    document.removeEventListener("click", record);
    host.remove();
  });
});

describe("code blocks", () => {
  let highlight: Highlight;
  beforeAll(async () => {
    highlight = await loadHighlight(["ts", "bash"]);
  });

  it("are wrapped with a copy button, the code escaped, before Shiki has loaded", () => {
    const host = dom("```ts\nconst a = 1 < 2 && '<b>';\n```");
    const wrap = host.querySelector("div")!;
    expect(wrap.className).toContain(PROSE.preWrap);
    const button = wrap.querySelector("button[data-kb-copy]")!;
    expect(button.getAttribute("aria-label")).toBe("Copy code");
    const pre = wrap.querySelector("pre")!;
    expect(pre.className).toBe(PROSE.pre);
    expect(pre.textContent).toBe("const a = 1 < 2 && '<b>';");
    expect(host.querySelector("b")).toBeNull();
  });

  it("are coloured by Shiki with both themes as variables", () => {
    const host = dom("```ts\nconst answer: number = 42;\n```", { highlight });
    const wrap = host.querySelector("div")!;
    expect(wrap.classList.contains("shiki")).toBe(true);
    expect(wrap.classList.contains("github-light")).toBe(true);
    expect(wrap.classList.contains("github-dark")).toBe(true);
    const spans = Array.from(host.querySelectorAll("code span[style]"));
    expect(spans.length).toBeGreaterThan(1);
    const style = spans[0]!.getAttribute("style") ?? "";
    expect(style).toContain("--shiki-light:");
    expect(style).toContain("--shiki-dark:");
    expect(host.querySelector("pre")!.textContent).toBe("const answer: number = 42;");
  });

  it("highlight a language by any of its names", () => {
    const host = dom("```bash\necho hi\n```", { highlight });
    expect(host.querySelectorAll("code span[style]").length).toBeGreaterThan(0);
  });

  it("render an unknown language as plain text, losing nothing", () => {
    const code = "x := <weird> & 'stuff'\nline two";
    const host = dom("```klingon\n" + code + "\n```", { highlight });
    expect(host.querySelector("pre")!.textContent).toBe(code);
  });

  it("copy the block's text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const host = dom("```ts\nconst a = 1;\nconst b = 2;\n```", { highlight });
    document.body.append(host);
    host.addEventListener("click", (e) => handleProseClick(e, () => {}));
    const button = host.querySelector<HTMLButtonElement>("[data-kb-copy]")!;
    button.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(button.classList.contains("is-copied")).toBe(true));
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconst b = 2;");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    host.remove();
  });

  it("are listed for the highlighter by their info strings", () => {
    expect(codeInfos(lexMarkdown("```ts\na\n```\n\n> ```py\n> b\n> ```\n\n```\nc\n```"))).toEqual(["ts", "py", ""]);
  });

  it("keep inline code apart: only code outside a block is a pill", () => {
    const host = dom("Use `npm i` here.\n\n```\nnpm i\n```");
    const [inline, block] = Array.from(host.querySelectorAll("code"));
    expect(inline!.className).toBe(PROSE.code);
    expect(block!.className).toBe("");
  });
});

describe("tables", () => {
  it("are a real table laid out as the prose grid, sized to its columns", () => {
    const host = dom("| a | b | c |\n|---|:-:|--:|\n| 1 | `2` | 3 |\n| 4 | 5 | 6 |");
    const wrap = host.firstElementChild!;
    expect(wrap.className).toBe(PROSE.tableWrap);
    const table = wrap.querySelector("table")!;
    expect(table.className).toBe(PROSE.table);
    expect(table.getAttribute("role")).toBe("table");
    expect(table.style.getPropertyValue("--prose-cols")).toBe("3");
    expect(table.querySelectorAll("th")).toHaveLength(3);
    expect(table.querySelector("th")!.className).toBe(PROSE.th);
    expect(table.querySelector("td")!.className).toBe(PROSE.td);
    expect(table.querySelector("thead")!.className).toBe(PROSE.thead);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
  });
});

describe("task lists", () => {
  const src = "- [ ] one\n- [x] two\n- plain";

  it("carry GFM's classes and a checkbox per task, in order", () => {
    const host = dom(src, { interactiveTasks: true });
    const ul = host.querySelector("ul")!;
    expect(ul.classList.contains("contains-task-list")).toBe(true);
    const items = Array.from(ul.querySelectorAll("li"));
    expect(items.map((li) => li.classList.contains("task-list-item"))).toEqual([true, true, false]);
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    expect(boxes.some((b) => b.disabled)).toBe(false);
  });

  it("are disabled in the preview", () => {
    const boxes = Array.from(dom(src).querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.disabled)).toBe(true);
  });
});

describe("prose styling", () => {
  it("dresses each element as the Nuxt app's prose components did", () => {
    const host = dom("# One\n\n## Two\n\npara **bold** _em_\n\n> quote\n\n1. a\n\n---\n\n![alt](/pic.png)");
    expect(host.querySelector("h1")!.className).toBe(PROSE.h1);
    expect(host.querySelector("h2")!.className).toBe(PROSE.h2);
    expect(host.querySelector("p")!.className).toBe(PROSE.p);
    expect(host.querySelector("strong")!.className).toBe(PROSE.strong);
    expect(host.querySelector("em")!.className).toBe("");
    expect(host.querySelector("blockquote")!.className).toBe(PROSE.blockquote);
    expect(host.querySelector("ol")!.className).toBe(PROSE.ol);
    expect(host.querySelector("hr")!.className).toBe(PROSE.hr);
    const img = host.querySelector("img")!;
    expect(img.className).toBe(PROSE.img);
    expect(img.getAttribute("src")).toBe("/pic.png");
  });

  it("treats single newlines as spaces, as remark did", () => {
    expect(dom("one\ntwo").querySelector("br")).toBeNull();
  });
});

describe("heading sections", () => {
  const src = [
    "Intro line.",
    "",
    "# Alpha",
    "a text",
    "",
    "## Beta <!-- collapsed -->",
    "b text",
    "",
    "```md",
    "# not a heading",
    "```",
    "",
    "## Gamma",
    "",
    "# Alpha",
  ].join("\n");

  it("nest the lexed blocks under their headings", () => {
    const tree = buildSectionTree<Token>(lexMarkdown(src));
    expect(tree.lead.map((t) => t.type)).toEqual(["paragraph"]);
    expect(tree.sections.map((s) => s.level)).toEqual([1, 1]);
    const alpha = tree.sections[0]!;
    expect(alpha.blocks.map((t) => t.type)).toEqual(["paragraph"]);
    expect(alpha.children.map((s) => s.level)).toEqual([2, 2]);
    expect(alpha.children[0]!.blocks.map((t) => t.type)).toEqual(["paragraph", "code"]);
  });

  it("number headings the way the source markers do", () => {
    const tree = buildSectionTree<Token>(lexMarkdown(src));
    const indices: number[] = [];
    const walk = (list: typeof tree.sections) => {
      for (const s of list) {
        indices.push(s.index);
        walk(s.children);
      }
    };
    walk(tree.sections);
    expect(indices).toEqual([0, 1, 2, 3]);
    // The collapsed marker sits on "Beta" — section 1 in both numberings.
    expect(getCollapsedIndices(src)).toEqual(new Set([1]));
    expect(tree.sections[0]!.children[0]!.index).toBe(1);
  });

  it("render a heading on its own, without the fold marker, with an anchor id", () => {
    const tree = buildSectionTree<Token>(lexMarkdown(src));
    const beta = tree.sections[0]!.children[0]!;
    const html = renderTokens([beta.heading]);
    expect(html).not.toContain("collapsed");
    const host = document.createElement("div");
    host.innerHTML = html;
    const h2 = host.querySelector("h2")!;
    expect(h2.textContent).toBe("Beta");
    expect(h2.id).toBe("beta");
  });

  it("give repeated headings distinct ids across the whole note", () => {
    const tree = buildSectionTree<Token>(lexMarkdown(src));
    const ids = tree.sections.map((s) => {
      const host = document.createElement("div");
      host.innerHTML = renderTokens([s.heading]);
      return host.querySelector("h1")!.id;
    });
    expect(ids).toEqual(["alpha", "alpha-1"]);
  });

  it("render nothing for blank lines between blocks", () => {
    expect(lexMarkdown("a\n\n\n\nb").map((t) => t.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("slug headings as GitHub does", () => {
    expect(slugify("Hello, World! Ünïcode 2")).toBe("hello-world-ünïcode-2");
    expect(slugify("  `code` and  spaces ")).toBe("code-and--spaces");
  });
});

describe("ticking a task", () => {
  it("is remembered by the lexed blocks, so a later render keeps it", () => {
    const blocks = lexMarkdown("- [ ] one\n\n  more\n\n- [x] two\n\n```\n- [ ] not a task\n```\n\n- [ ] three");
    expect(setTaskChecked(blocks, 0, true)).toBe(true);
    expect(setTaskChecked(blocks, 2, true)).toBe(true);
    expect(setTaskChecked(blocks, 1, false)).toBe(true);
    expect(setTaskChecked(blocks, 3, true)).toBe(false);
    const host = document.createElement("div");
    host.innerHTML = renderTokens(blocks, { interactiveTasks: true });
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
  });
});
