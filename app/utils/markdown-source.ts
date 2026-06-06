// Pure markdown-source transforms — no DOM, no Vue — so they're unit-
// testable and a bug here can't silently corrupt a note's source. Used by
// the note stream component (heading folds + checkbox toggles, persisted
// back into the markdown) and by the Format composable (list-marker pre-pass).

// ── Heading folds ─────────────────────────────────────────────────────────
// Folds are stored in the markdown itself as a trailing `<!-- collapsed -->`
// marker on the heading line — the source is the source of truth, no separate
// fold state.
export const COLLAPSED_RE = /<!--\s*collapsed\s*-->/

export type HeadingInfo = {
  idx: number      // document-order index across headings
  line: number     // 0-based source line
  level: number    // 1-6
  text: string     // heading text with the marker stripped
  marker: boolean  // collapsed marker present?
}

// Yields every heading (skipping fenced code) in document order.
export function* iterHeadings(content: string): Generator<HeadingInfo> {
  const lines = content.split('\n')
  let inFence = false
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!m) continue
    const marker = COLLAPSED_RE.test(m[2]!)
    const text = m[2]!.replace(COLLAPSED_RE, '').trim()
    yield { idx, line: i, level: m[1]!.length, text, marker }
    idx++
  }
}

// Document-order indices of headings whose source line carries the marker.
export function getCollapsedIndices(content: string): Set<number> {
  const set = new Set<number>()
  for (const h of iterHeadings(content)) {
    if (h.marker) set.add(h.idx)
  }
  return set
}

// Toggle the collapsed marker on the heading at `targetIdx`. Returns the new
// source, or the original string (same reference) when the index doesn't
// match — callers use the identity check to skip a needless save.
export function toggleHeadingCollapsed(content: string, targetIdx: number): string {
  const lines = content.split('\n')
  for (const h of iterHeadings(content)) {
    if (h.idx !== targetIdx) continue
    const hashes = '#'.repeat(h.level)
    lines[h.line] = h.marker
      ? `${hashes} ${h.text}`
      : `${hashes} ${h.text} <!-- collapsed -->`
    return lines.join('\n')
  }
  return content
}

// ── Task checkboxes ───────────────────────────────────────────────────────
// Flip the Nth GFM task-list checkbox (document order, skipping fenced code).
// Returns the new source, or null when n is out of range — the caller treats
// that as "DOM/source drifted" and bails rather than corrupt the note.
export function toggleNthTask(content: string, n: number, checked: boolean): string | null {
  const lines = content.split('\n')
  let inFence = false
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(\s*[-*+] +)\[([ xX])\]/)
    if (!m) continue
    if (count === n) {
      lines[i] = m[1] + (checked ? '[x]' : '[ ]') + line.slice(m[0].length)
      return lines.join('\n')
    }
    count++
  }
  return null
}

// ── List-marker repair (Format pre-pass) ───────────────────────────────────
// Humans paste list items with markers CommonMark doesn't recognize: `-item`
// (missing the required space) or Unicode bullets (•◦▪▫‣⁃). Normalize them to
// `- item` before remark runs — but only when 2+ consecutive lines look like
// list items, so a stray `*emphasis*` or lone `•` isn't misclassified. A
// short preceding "Title:" line is promoted to a `## Title` heading.
const UNICODE_BULLET_RE = /^[•◦▪▫‣⁃]\s*/  // • ◦ ▪ ▫ ‣ ⁃
const STANDARD_BROKEN_RE = /^[-*+]\S/      // -item / *item / +item
const STANDARD_OK_RE = /^[-*+]\s/          // - item
const TITLE_MAX_LEN = 60

export function isListLooking(line: string): boolean {
  return UNICODE_BULLET_RE.test(line) || STANDARD_BROKEN_RE.test(line) || STANDARD_OK_RE.test(line)
}

export function fixListLine(line: string): string {
  if (UNICODE_BULLET_RE.test(line)) return line.replace(UNICODE_BULLET_RE, '- ')
  if (STANDARD_BROKEN_RE.test(line)) return line.replace(/^([-*+])/, '$1 ')
  return line
}

export function isPromotableTitle(line: string): boolean {
  const t = line.trim()
  if (!t.endsWith(':')) return false
  if (t.startsWith('#')) return false        // already a heading
  if (t.length > TITLE_MAX_LEN) return false  // probably a sentence, not a title
  return true
}

export function repairListMarkers(input: string): string {
  const lines = input.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    let j = i
    while (j < lines.length && isListLooking(lines[j]!)) j++
    if (j - i >= 2) {
      // Promote a preceding "Title:" line to `## Title`. Skip back through
      // blank lines to find the last non-empty entry.
      let prevIdx = out.length - 1
      while (prevIdx >= 0 && (out[prevIdx] ?? '').trim() === '') prevIdx--
      const prev = prevIdx >= 0 ? out[prevIdx] : undefined
      if (prev !== undefined && isPromotableTitle(prev)) {
        const trimmed = prev.trim()
        out[prevIdx] = `## ${trimmed.slice(0, -1).trim()}`
      }
      for (let k = i; k < j; k++) out.push(fixListLine(lines[k]!))
      i = j
    }
    else {
      out.push(lines[i]!)
      i++
    }
  }
  return out.join('\n')
}
