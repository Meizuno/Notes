import { describe, expect, it } from "vitest";

import { markMatches, plainSnippet } from "../search-marks";

describe("search result marks", () => {
  it("marks every matched word, whatever its case, as text", () => {
    expect(markMatches("TypeScript is typed", "type")).toEqual([
      { text: "Type", hit: true },
      { text: "Script is ", hit: false },
      { text: "type", hit: true },
      { text: "d", hit: false },
    ]);
  });

  it("marks several words, and treats regex characters as letters", () => {
    expect(markMatches("a.b c+d", "a.b c+d").filter((r) => r.hit).map((r) => r.text)).toEqual(["a.b", "c+d"]);
  });

  it("leaves out one-letter words unless the query is nothing else", () => {
    expect(markMatches("a vue app", "a vue").filter((r) => r.hit).map((r) => r.text)).toEqual(["vue"]);
    expect(markMatches("x and y", "x").filter((r) => r.hit).map((r) => r.text)).toEqual(["x"]);
  });

  it("returns the text unmarked for an empty query, and nothing for no text", () => {
    expect(markMatches("abc", "  ")).toEqual([{ text: "abc", hit: false }]);
    expect(markMatches("", "abc")).toEqual([]);
  });
});

describe("search snippets as prose", () => {
  it("drops markdown syntax, keeping the words", () => {
    expect(plainSnippet("# Prisma\nTypeScript-first **ORM** for `PostgreSQL`")).toBe(
      "Prisma TypeScript-first ORM for PostgreSQL",
    );
    expect(plainSnippet("- [ ] task one\n- item\n1. first\n> quoted")).toBe("task one item first quoted");
    expect(plainSnippet("see [the docs](https://x.y) ![img](data:z)")).toBe("see the docs");
    expect(plainSnippet("…notes. ## Languages <!-- collapsed --> more")).toBe("…notes. Languages more");
  });

  it("keeps underscores, which are as often part of a word", () => {
    expect(plainSnippet("call __init__ and snake_case")).toBe("call __init__ and snake_case");
  });
});
