import { describe, expect, it } from "vitest";

import { readNdjson } from "../ndjson";

/** A byte stream that delivers exactly these chunks, in order. */
function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      controller.close();
    },
  });
}

async function all<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe("reading NDJSON", () => {
  it("yields one value per line, meta first as the server sends it", async () => {
    const lines = await all(
      readNdjson(streamOf(['{"meta":{"total":2,"hasMore":false}}\n{"item":{"id":"a"}}\n{"item":{"id":"b"}}\n'])),
    );
    expect(lines).toEqual([{ meta: { total: 2, hasMore: false } }, { item: { id: "a" } }, { item: { id: "b" } }]);
  });

  it("joins a line split across chunks", async () => {
    const lines = await all(readNdjson(streamOf(['{"a":', "1}\n{", '"b":2', "}\n"])));
    expect(lines).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("joins a character split across chunks", async () => {
    const bytes = new TextEncoder().encode('{"t":"čaj ☕"}\n');
    // Cut in the middle of the three-byte ☕.
    const cut = bytes.length - 4;
    const lines = await all(readNdjson(streamOf([bytes.slice(0, cut), bytes.slice(cut)])));
    expect(lines).toEqual([{ t: "čaj ☕" }]);
  });

  it("yields a last line that has no newline, and skips blank ones", async () => {
    const lines = await all(readNdjson(streamOf(['{"a":1}\r\n\n\n', '{"b":2}'])));
    expect(lines).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("yields each line as soon as it has arrived", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode('{"meta":{"total":1,"hasMore":false}}\n'));
        await gate;
        controller.enqueue(enc.encode('{"item":{"id":"a"}}\n'));
        controller.close();
      },
    });
    const gen = readNdjson<unknown>(body);
    // The first line comes out while the second has not been sent yet.
    expect((await gen.next()).value).toEqual({ meta: { total: 1, hasMore: false } });
    release();
    expect((await gen.next()).value).toEqual({ item: { id: "a" } });
    expect((await gen.next()).done).toBe(true);
  });

  it("throws on a line that is not JSON", async () => {
    await expect(all(readNdjson(streamOf(['{"a":1}\nnot json\n'])))).rejects.toThrow(SyntaxError);
  });

  it("stops reading when the caller stops", async () => {
    let cancelled = false;
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(enc.encode('{"n":1}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const _ of readNdjson(body)) break;
    expect(cancelled).toBe(true);
  });
});
