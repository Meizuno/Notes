import { describe, expect, it } from "vitest";

import { applyMarkdown, type MarkdownAction } from "../markdown-edit";

// `|` marks the selection in these cases: "a|b|c" selects "b"; "a||b" is a
// cursor between a and b.
function run(marked: string, action: MarkdownAction): string {
  const start = marked.indexOf("|");
  const end = marked.indexOf("|", start + 1) - 1;
  const text = marked.replace(/\|/g, "");
  const out = applyMarkdown(text, start, end, action);
  return `${out.text.slice(0, out.start)}|${out.text.slice(out.start, out.end)}|${out.text.slice(out.end)}`;
}

describe("the editor's markdown actions", () => {
  it("wraps a selection, and unwraps it again", () => {
    expect(run("say |hi| now", "bold")).toBe("say **|hi|** now");
    expect(run("say **|hi|** now", "bold")).toBe("say |hi| now");
    expect(run("say |**hi**| now", "bold")).toBe("say |hi| now");
    expect(run("a |b| c", "italic")).toBe("a _|b|_ c");
    expect(run("a |b| c", "strike")).toBe("a ~~|b|~~ c");
    expect(run("a |b| c", "code")).toBe("a `|b|` c");
  });

  it("puts a placeholder between the marks when nothing is selected, selected", () => {
    expect(run("x ||", "bold")).toBe("x **|bold text|**");
  });

  it("makes a link: the label selected, or the address left to type", () => {
    expect(run("see |docs|.", "link")).toBe("see [docs](|url|).");
    expect(run("||", "link")).toBe("[|link text|](url)");
    expect(run("|https://example.com|", "link")).toBe("[|link text|](https://example.com)");
  });

  it("fences a selection as a code block on lines of its own", () => {
    expect(run("before |x = 1| after", "codeblock")).toBe("before \n```\n|x = 1|\n```\n after");
    expect(run("||", "codeblock")).toBe("```\n|code|\n```");
  });

  it("toggles a heading on the line the cursor is on", () => {
    expect(run("one\ntw||o\nthree", "heading")).toBe("one\n|## two|\nthree");
    expect(run("|## two|", "heading")).toBe("|two|");
    expect(run("|# two|", "heading")).toBe("|two|");
  });

  it("bullets, numbers and checks every selected line, and takes them off again", () => {
    expect(run("|a\nb|", "bullet")).toBe("|- a\n- b|");
    expect(run("|- a\n- b|", "bullet")).toBe("|a\nb|");
    expect(run("|a\nb\nc|", "numbered")).toBe("|1. a\n2. b\n3. c|");
    expect(run("|a\nb|", "task")).toBe("|- [ ] a\n- [ ] b|");
    expect(run("|> a\n> b|", "quote")).toBe("|a\nb|");
    expect(run("|a\nb|", "quote")).toBe("|> a\n> b|");
  });

  it("switches one kind of list to another rather than stacking markers", () => {
    expect(run("|- a\n- b|", "numbered")).toBe("|1. a\n2. b|");
    expect(run("|  - a|", "task")).toBe("|  - [ ] a|");
    expect(run("|- [ ] a|", "bullet")).toBe("|- a|");
  });

  it("leaves blank lines inside a selection blank", () => {
    expect(run("|a\n\nb|", "bullet")).toBe("|- a\n\n- b|");
  });

  it("puts the cursor after a marker added to an empty line", () => {
    expect(run("a\n||", "bullet")).toBe("a\n- ||");
  });
});
