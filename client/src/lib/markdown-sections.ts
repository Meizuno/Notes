// Pure transform: turn the flat block list of parsed markdown into a
// heading-nested section tree, so the note view can render folds
// declaratively in one pass (no post-render DOM walking).
//
// Markdown headings are flat siblings — `# A`, `<p>`, `## B`, `<p>` — with the
// "section under a heading" only implied (everything until the next heading
// of the same or higher level). This groups that implicit structure into real
// nodes: each heading owns the blocks that follow it, and lower headings
// become nested child sections.
//
// Headings are numbered in document order, which matches the index
// `markdown-source.ts` (iterHeadings / getCollapsedIndices) assigns over the
// raw markdown — so a section's `index` lines up with the `<!-- collapsed -->`
// markers that persist fold state.

export type SectionNode<T> = {
  heading: T;
  level: number; // 1–6
  index: number; // document-order heading index (matches the source markers)
  blocks: T[]; // direct, non-heading content under this heading
  children: SectionNode<T>[];
};

export type SectionTree<T> = {
  lead: T[]; // blocks before the first heading (rendered un-foldable)
  sections: SectionNode<T>[];
};

// A heading is either an element node with a `tag` of h1…h6 (the shape the
// Nuxt app's MDC AST had, and the tests still use) or a marked token of type
// `heading` with its `depth`. Anything else (paragraphs, lists, the
// `<!-- collapsed -->` comments, `space` tokens, …) is content.
function headingLevel(node: unknown): number | null {
  const n = node as { tag?: unknown; type?: unknown; depth?: unknown };
  if (typeof n.tag === "string" && /^h[1-6]$/.test(n.tag)) return Number(n.tag.slice(1));
  if (n.type === "heading" && typeof n.depth === "number" && n.depth >= 1 && n.depth <= 6) return n.depth;
  return null;
}

export function buildSectionTree<T>(children: readonly T[]): SectionTree<T> {
  const lead: T[] = [];
  const sections: SectionNode<T>[] = [];
  const stack: SectionNode<T>[] = [];
  let index = 0;

  for (const node of children) {
    const level = headingLevel(node);
    if (level === null) {
      // Content block → belongs to the innermost open section, or to the lead
      // if we haven't seen a heading yet.
      if (stack.length) stack[stack.length - 1]!.blocks.push(node);
      else lead.push(node);
      continue;
    }

    const section: SectionNode<T> = { heading: node, level, index: index++, blocks: [], children: [] };
    // Close any open sections at the same or deeper level — a same/higher
    // heading ends the previous section.
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1]!.children.push(section);
    else sections.push(section);
    stack.push(section);
  }

  return { lead, sections };
}
