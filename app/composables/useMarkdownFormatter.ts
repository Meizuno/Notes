// Round-trips markdown through remark to normalize formatting:
//   - bullets: '-' (consistent across nested lists)
//   - emphasis: '_', strong: '*'
//   - fenced code blocks (no indented variants)
//   - blank lines around blocks, one-space list indentation
//   - GFM extensions (tables, strikethrough, task lists) preserved
//
// The list-marker pre-pass (Unicode bullets, missing-space markers, "Title:"
// → "## Title") lives in app/utils/markdown-source as `repairListMarkers`, so
// it's pure and unit-tested. Remark itself is loaded lazily so its ~50KB only
// ships when the user actually clicks the Format button.
export function useMarkdownFormatter() {
  const formatting = ref(false)

  async function format(input: string): Promise<string> {
    if (formatting.value || !input.trim()) return input
    formatting.value = true
    try {
      const repaired = repairListMarkers(input)
      const [{ remark }, { default: remarkGfm }] = await Promise.all([
        import('remark'),
        import('remark-gfm')
      ])
      const file = await remark()
        .use(remarkGfm)
        .data('settings', {
          bullet: '-',
          emphasis: '_',
          strong: '*',
          fence: '`',
          listItemIndent: 'one',
          rule: '-'
        })
        .process(repaired)
      // remark always emits a trailing newline; trim+restore so the
      // editor doesn't accumulate blank lines on repeated formatting.
      return String(file).trimEnd() + '\n'
    }
    finally {
      formatting.value = false
    }
  }

  return { format, formatting }
}
