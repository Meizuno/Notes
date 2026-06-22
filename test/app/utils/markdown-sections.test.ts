import { describe, it, expect } from 'vitest'
import { buildSectionTree } from '../../../app/utils/markdown-sections'

// Minimal stand-ins for MDC AST nodes — only `tag` matters to the transform.
const h = (level: number, label = '') => ({ tag: `h${level}`, label })
const p = (label = '') => ({ tag: 'p', label })

describe('buildSectionTree', () => {
  it('collects blocks before the first heading as lead', () => {
    const tree = buildSectionTree([p('a'), p('b')])
    expect(tree.lead).toHaveLength(2)
    expect(tree.sections).toHaveLength(0)
  })

  it('attaches following blocks to their heading', () => {
    const tree = buildSectionTree([h(2, 'A'), p('a1'), p('a2'), h(2, 'B'), p('b1')])
    expect(tree.sections).toHaveLength(2)
    expect(tree.sections[0]!.blocks).toHaveLength(2)
    expect(tree.sections[1]!.blocks).toHaveLength(1)
  })

  it('nests a deeper heading as a child section', () => {
    const tree = buildSectionTree([h(2, 'A'), p('a'), h(3, 'A.1'), p('a1'), h(2, 'B')])
    expect(tree.sections).toHaveLength(2)
    const a = tree.sections[0]!
    expect(a.blocks).toHaveLength(1) // 'a'
    expect(a.children).toHaveLength(1)
    expect(a.children[0]!.level).toBe(3)
    expect(a.children[0]!.blocks).toHaveLength(1) // 'a1'
  })

  it('numbers headings in document order regardless of nesting', () => {
    const tree = buildSectionTree([h(1), h(2), h(3), h(2), h(1)])
    // indices assigned 0..4 in the order encountered
    expect(tree.sections.map(s => s.index)).toEqual([0, 4])
    const top = tree.sections[0]!
    expect(top.children[0]!.index).toBe(1)          // h2
    expect(top.children[0]!.children[0]!.index).toBe(2) // h3
    expect(top.children[1]!.index).toBe(3)          // second h2
  })

  it('closes sections at the same or higher level', () => {
    // h3 then h2: the h2 is a sibling of the first h2's parent, not nested
    const tree = buildSectionTree([h(2, 'A'), h(3, 'A.1'), h(2, 'B')])
    expect(tree.sections.map(s => s.level)).toEqual([2, 2])
    expect(tree.sections[0]!.children).toHaveLength(1)
    expect(tree.sections[1]!.children).toHaveLength(0)
  })
})
