import { describe, it, expect } from 'vitest'
import {
  iterHeadings,
  getCollapsedIndices,
  toggleHeadingCollapsed,
  toggleNthTask,
  repairListMarkers
} from '../../../app/utils/markdown-source'

describe('toggleNthTask', () => {
  const src = '- [ ] one\n- [x] two\n- [ ] three'

  it('flips the Nth checkbox (0-based, document order)', () => {
    expect(toggleNthTask(src, 0, true)).toBe('- [x] one\n- [x] two\n- [ ] three')
    expect(toggleNthTask(src, 1, false)).toBe('- [ ] one\n- [ ] two\n- [ ] three')
  })

  it('skips checkboxes inside fenced code', () => {
    const withFence = '```\n- [ ] not a task\n```\n- [ ] real'
    expect(toggleNthTask(withFence, 0, true)).toBe('```\n- [ ] not a task\n```\n- [x] real')
  })

  it('preserves indentation and trailing text', () => {
    expect(toggleNthTask('  - [ ] indented item', 0, true)).toBe('  - [x] indented item')
  })

  it('returns null when n is out of range', () => {
    expect(toggleNthTask(src, 9, true)).toBeNull()
    expect(toggleNthTask('no tasks here', 0, true)).toBeNull()
  })
})

describe('iterHeadings / getCollapsedIndices', () => {
  it('finds headings in document order, skipping fenced code', () => {
    const src = '# A\n\ntext\n\n## B\n\n```\n# not a heading\n```\n\n### C'
    const heads = [...iterHeadings(src)]
    expect(heads.map(h => h.idx)).toEqual([0, 1, 2])
    expect(heads.map(h => h.text)).toEqual(['A', 'B', 'C'])
    expect(heads.map(h => h.level)).toEqual([1, 2, 3])
  })

  it('detects the collapsed marker (stripped from text) and reports indices', () => {
    const src = '# A\n## B <!-- collapsed -->\n### C'
    expect(getCollapsedIndices(src)).toEqual(new Set([1]))
    const heads = [...iterHeadings(src)]
    expect(heads[1]!.marker).toBe(true)
    expect(heads[1]!.text).toBe('B')
  })

  it('returns an empty set when nothing is collapsed', () => {
    expect(getCollapsedIndices('# A\n## B')).toEqual(new Set())
  })
})

describe('toggleHeadingCollapsed', () => {
  it('adds the marker when absent', () => {
    expect(toggleHeadingCollapsed('# A\n## B', 0)).toBe('# A <!-- collapsed -->\n## B')
  })

  it('removes the marker when present', () => {
    expect(toggleHeadingCollapsed('# A <!-- collapsed -->\n## B', 0)).toBe('# A\n## B')
  })

  it('targets the heading by document index', () => {
    expect(toggleHeadingCollapsed('# A\n## B\n### C', 1)).toBe('# A\n## B <!-- collapsed -->\n### C')
  })

  it('is idempotent (toggle twice = original)', () => {
    const src = '# A\n## B\n### C'
    expect(toggleHeadingCollapsed(toggleHeadingCollapsed(src, 2), 2)).toBe(src)
  })

  it('returns the same string when the index does not match', () => {
    const src = '# A'
    expect(toggleHeadingCollapsed(src, 5)).toBe(src)
  })
})

describe('repairListMarkers', () => {
  it('normalizes unicode bullets to "- " over 2+ consecutive lines', () => {
    expect(repairListMarkers('•one\n•two')).toBe('- one\n- two')
    expect(repairListMarkers('▪ a\n▪ b')).toBe('- a\n- b')
  })

  it('adds the missing space to broken markers', () => {
    expect(repairListMarkers('-one\n-two')).toBe('- one\n- two')
  })

  it('only fires on 2+ consecutive list-looking lines', () => {
    expect(repairListMarkers('•lonely')).toBe('•lonely')
    expect(repairListMarkers('-stray\n\nplain text')).toBe('-stray\n\nplain text')
  })

  it('promotes a short preceding "Title:" line to "## Title"', () => {
    expect(repairListMarkers('Ingredients:\n- a\n- b')).toBe('## Ingredients\n- a\n- b')
  })

  it('does not promote an over-long title', () => {
    const long = 'A'.repeat(61) + ':'
    expect(repairListMarkers(`${long}\n- a\n- b`)).toBe(`${long}\n- a\n- b`)
  })

  it('leaves a single stray line and normal fenced code untouched', () => {
    expect(repairListMarkers('- just one')).toBe('- just one')
    const code = '```js\nconst x = 1\nreturn x\n```'
    expect(repairListMarkers(code)).toBe(code)
  })
})
