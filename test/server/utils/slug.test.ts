import { describe, it, expect } from 'vitest'
import { slugifyTitle } from '../../../server/utils/slug'

describe('slugifyTitle', () => {
  it('lowercases and dash-joins ASCII titles', () => {
    expect(slugifyTitle('DDD Overview')).toBe('ddd-overview')
  })

  it('transliterates Cyrillic', () => {
    expect(slugifyTitle('Канонічна форма')).toBe('kanonichna-forma')
  })

  it('strips Latin diacritics', () => {
    expect(slugifyTitle('Oběd')).toBe('obed')
  })

  it('falls back to "note" for whitespace/symbol-only titles', () => {
    expect(slugifyTitle('   ')).toBe('note')
    expect(slugifyTitle('😀')).toBe('note')
  })

  it('caps the length and leaves no trailing dash', () => {
    const s = slugifyTitle('word '.repeat(60))
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-')).toBe(false)
  })
})
