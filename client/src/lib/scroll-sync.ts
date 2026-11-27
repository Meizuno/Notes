// Two panes scrolling as one: the editor's text and its preview. Each block of
// the note is an anchor — where its first line sits in the text, where its
// render sits in the preview — and the preview's position for any position of
// the text is read off the line between the two anchors around it. Pure, so
// the mapping is a unit test; the DOM measuring is useScrollSync's.

export interface Anchor {
  /** The editor's scrollTop that puts this block's first line at the top. */
  editor: number;
  /** The preview's scrollTop that puts this block's render at the top. */
  preview: number;
}

/**
 * The anchors to scroll by: the tops of both panes, every block in order, and
 * the bottoms of both, so the two reach their ends together. A block that
 * would turn back in either pane (a measurement taken mid-render) is skipped.
 */
export function buildAnchors(
  editorTops: number[],
  previewTops: number[],
  editorMax: number,
  previewMax: number,
): Anchor[] {
  const anchors: Anchor[] = [{ editor: 0, preview: 0 }];
  const n = Math.min(editorTops.length, previewTops.length);
  for (let i = 0; i < n; i++) {
    const editor = editorTops[i]!;
    const preview = Math.min(previewTops[i]!, previewMax);
    const last = anchors[anchors.length - 1]!;
    if (editor <= last.editor || editor >= editorMax || preview < last.preview) continue;
    anchors.push({ editor, preview });
  }
  const last = anchors[anchors.length - 1]!;
  if (editorMax > last.editor) anchors.push({ editor: editorMax, preview: Math.max(previewMax, last.preview) });
  return anchors;
}

/** The preview's scrollTop for the editor's, by the anchors around it. */
export function previewScrollFor(anchors: Anchor[], editorTop: number): number {
  if (!anchors.length) return 0;
  if (editorTop <= anchors[0]!.editor) return anchors[0]!.preview;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (editorTop <= b.editor) {
      const t = (editorTop - a.editor) / (b.editor - a.editor);
      return a.preview + t * (b.preview - a.preview);
    }
  }
  return anchors[anchors.length - 1]!.preview;
}
