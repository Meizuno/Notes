import { describe, expect, it } from "vitest";

import { buildAnchors, previewScrollFor } from "../scroll-sync";

describe("scrolling the preview with the text", () => {
  it("anchors both tops, every block, and both bottoms", () => {
    expect(buildAnchors([100, 300], [50, 400], 500, 900)).toEqual([
      { editor: 0, preview: 0 },
      { editor: 100, preview: 50 },
      { editor: 300, preview: 400 },
      { editor: 500, preview: 900 },
    ]);
  });

  it("skips a block that would turn back, or sits past the end", () => {
    expect(buildAnchors([100, 90, 200, 600], [50, 60, 40, 700], 500, 800)).toEqual([
      { editor: 0, preview: 0 },
      { editor: 100, preview: 50 },
      { editor: 500, preview: 800 },
    ]);
  });

  it("reads the preview's position off the line between two anchors", () => {
    const anchors = buildAnchors([100, 300], [50, 400], 500, 900);
    expect(previewScrollFor(anchors, 0)).toBe(0);
    expect(previewScrollFor(anchors, 50)).toBe(25);
    expect(previewScrollFor(anchors, 100)).toBe(50);
    expect(previewScrollFor(anchors, 200)).toBe(225);
    expect(previewScrollFor(anchors, 500)).toBe(900);
    expect(previewScrollFor(anchors, 9999)).toBe(900);
  });

  it("holds the preview still when neither pane scrolls", () => {
    expect(buildAnchors([], [], 0, 0)).toEqual([{ editor: 0, preview: 0 }]);
    expect(previewScrollFor(buildAnchors([], [], 0, 0), 0)).toBe(0);
  });
});
