/** A run of text, and whether it is one of the searched words. */
export interface MarkedRun {
  text: string;
  hit: boolean;
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` cut into runs, the case-insensitive matches of the query's words
 * marked — for showing why a search result matched, as text (never HTML).
 * Words of one letter are left out unless the query is nothing else, or a
 * search for "a b" would mark every a in the snippet.
 */
export function markMatches(text: string, query: string): MarkedRun[] {
  const all = query.toLowerCase().split(/\s+/).filter(Boolean);
  const long = all.filter((w) => w.length > 1);
  const words = [...new Set(long.length ? long : all)];
  if (!text || !words.length) return text ? [{ text, hit: false }] : [];
  const pattern = new RegExp(`(${words.map(escape).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}

/**
 * A search snippet as prose: the server cuts it from the note's markdown, so
 * it can carry `#`, backticks, list markers, link syntax and fold markers.
 * Underscores stay — they are as often part of a word as emphasis.
 */
export function plainSnippet(snippet: string): string {
  return snippet
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, ""))
    .join(" ")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/[*`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
