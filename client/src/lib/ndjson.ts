// Newline-delimited JSON, read as it arrives.
//
// GET /api/notes streams one JSON value per line — `{"meta":…}` first, then an
// `{"item":…}` per note, paced so a list fills in as a cascade rather than all
// at once. Reading the whole body before parsing would throw that away, so the
// body is decoded chunk by chunk and a line is yielded the moment its newline
// arrives.
//
// A chunk boundary can fall anywhere: in the middle of a line, and in the
// middle of a multi-byte UTF-8 character. The decoder is streaming for the
// second; the carried-over remainder handles the first.

/**
 * Yield each JSON line of a byte stream. Blank lines are skipped; a final line
 * without its newline is still yielded. A line that is not JSON throws — the
 * stream is corrupt, and a half-rendered list is better told than guessed at.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
        newline = pending.indexOf("\n");
      }
      if (done) break;
    }
    const last = pending.trim();
    if (last) yield JSON.parse(last) as T;
  } finally {
    // Stopping early (a `break` in the caller's for-await) cancels the rest of
    // the response rather than leaving the connection draining unread.
    reader.releaseLock();
    await body.cancel().catch(() => {});
  }
}
