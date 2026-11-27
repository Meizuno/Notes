// The editor toolbar's actions, as pure text edits: given the note's text and
// the selection, the new text and the selection to leave behind. The toolbar
// and the keyboard shortcuts (NoteForm) apply them; nothing here touches the
// DOM, so every action is a unit test.
//
// Each action toggles where that reads naturally: bold on bold text unwraps
// it, a bullet on bulleted lines removes the bullets.

export type MarkdownAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "heading"
  | "quote"
  | "bullet"
  | "numbered"
  | "task"
  | "codeblock";

export interface TextEdit {
  text: string;
  /** The selection to leave: start and end offsets into `text`. */
  start: number;
  end: number;
}

const WRAPS: Partial<Record<MarkdownAction, { mark: string; placeholder: string }>> = {
  bold: { mark: "**", placeholder: "bold text" },
  italic: { mark: "_", placeholder: "italic text" },
  strike: { mark: "~~", placeholder: "struck text" },
  code: { mark: "`", placeholder: "code" },
};

// Any list marker a line may already carry, so switching a bulleted line to a
// numbered one replaces the bullet rather than stacking on it. Every
// `replaces` pattern captures the line's indent as its one group.
const LIST_MARKER = /^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

export function applyMarkdown(text: string, start: number, end: number, action: MarkdownAction): TextEdit {
  const lo = Math.max(0, Math.min(start, end, text.length));
  const hi = Math.min(text.length, Math.max(start, end));

  const wrap = WRAPS[action];
  if (wrap) return toggleWrap(text, lo, hi, wrap.mark, wrap.placeholder);

  switch (action) {
    case "link":
      return link(text, lo, hi);
    case "codeblock":
      return codeBlock(text, lo, hi);
    case "heading":
      return toggleLines(text, lo, hi, /^#{1,6} /, () => "## ", /^()#{1,6} /);
    case "quote":
      return toggleLines(text, lo, hi, /^> ?/, () => "> ", null);
    case "bullet":
      return toggleLines(text, lo, hi, /^\s*[-*+] (?!\[[ xX]\] )/, () => "- ", LIST_MARKER);
    case "numbered":
      return toggleLines(text, lo, hi, /^\s*\d+[.)] /, (i) => `${i + 1}. `, LIST_MARKER);
    case "task":
      return toggleLines(text, lo, hi, /^\s*[-*+] \[[ xX]\] /, () => "- [ ] ", LIST_MARKER);
    default:
      return { text, start: lo, end: hi };
  }
}

function toggleWrap(text: string, lo: number, hi: number, mark: string, placeholder: string): TextEdit {
  const selected = text.slice(lo, hi);
  const n = mark.length;

  // The marks sit just outside the selection: take them away.
  if (text.slice(lo - n, lo) === mark && text.slice(hi, hi + n) === mark && lo >= n) {
    return { text: text.slice(0, lo - n) + selected + text.slice(hi + n), start: lo - n, end: hi - n };
  }
  // The selection includes its marks: take them away.
  if (selected.length >= 2 * n && selected.startsWith(mark) && selected.endsWith(mark)) {
    const inner = selected.slice(n, selected.length - n);
    return { text: text.slice(0, lo) + inner + text.slice(hi), start: lo, end: lo + inner.length };
  }
  const body = selected || placeholder;
  return {
    text: text.slice(0, lo) + mark + body + mark + text.slice(hi),
    start: lo + n,
    end: lo + n + body.length,
  };
}

function link(text: string, lo: number, hi: number): TextEdit {
  const selected = text.slice(lo, hi);
  // A selected address becomes the target; anything else, the label.
  if (/^https?:\/\/\S+$/.test(selected)) {
    const label = "link text";
    return {
      text: `${text.slice(0, lo)}[${label}](${selected})${text.slice(hi)}`,
      start: lo + 1,
      end: lo + 1 + label.length,
    };
  }
  const label = selected || "link text";
  const inserted = `[${label}](url)`;
  const next = text.slice(0, lo) + inserted + text.slice(hi);
  // With a label chosen, the address is what is left to type; without one,
  // the label is.
  if (selected) {
    const url = lo + label.length + 3;
    return { text: next, start: url, end: url + 3 };
  }
  return { text: next, start: lo + 1, end: lo + 1 + label.length };
}

function codeBlock(text: string, lo: number, hi: number): TextEdit {
  const body = text.slice(lo, hi) || "code";
  const before = lo > 0 && text[lo - 1] !== "\n" ? "\n" : "";
  const after = hi < text.length && text[hi] !== "\n" ? "\n" : "";
  const open = `${before}\`\`\`\n`;
  const block = `${open}${body}\n\`\`\`${after}`;
  const start = lo + open.length;
  return { text: text.slice(0, lo) + block + text.slice(hi), start, end: start + body.length };
}

/** The whole lines the selection touches: [first line's start, last line's end). */
function lineSpan(text: string, lo: number, hi: number): [number, number] {
  const first = text.lastIndexOf("\n", lo - 1) + 1;
  // A selection ending just after a newline does not take in the next line.
  const stop = hi > lo && text[hi - 1] === "\n" ? hi - 1 : hi;
  const last = text.indexOf("\n", stop);
  return [first, last === -1 ? text.length : last];
}

function toggleLines(
  text: string,
  lo: number,
  hi: number,
  has: RegExp,
  prefix: (i: number) => string,
  replaces: RegExp | null,
): TextEdit {
  const [first, last] = lineSpan(text, lo, hi);
  const lines = text.slice(first, last).split("\n");
  const filled = lines.filter((line) => line.trim() !== "");
  const allHave = filled.length > 0 && filled.every((line) => has.test(line));

  let counter = 0;
  const next = lines.map((line) => {
    if (allHave) return line.replace(has, (m) => m.match(/^\s*/)?.[0] ?? "");
    // Blank lines inside a selection stay blank; a lone blank line is where
    // the cursor wants the marker.
    if (line.trim() === "" && lines.length > 1) return line;
    const marker = prefix(counter++);
    if (replaces && replaces.test(line)) return line.replace(replaces, (_m, indent: string) => `${indent ?? ""}${marker}`);
    return marker + line;
  });

  const block = next.join("\n");
  const out = text.slice(0, first) + block + text.slice(last);
  // A cursor on one empty line lands after the new marker, ready to type.
  if (lo === hi && lines.length === 1 && lines[0]!.trim() === "") {
    const at = first + block.length;
    return { text: out, start: at, end: at };
  }
  return { text: out, start: first, end: first + block.length };
}
