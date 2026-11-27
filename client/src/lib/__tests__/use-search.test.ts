import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

// The sidebar search: debounced while typing, and a newer query wins over an
// older one still on its way. A fresh module per test, its state is shared.

const ndjson = (lines: unknown[]) =>
  new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
const item = (id: string, title: string) => ({
  item: { id, title, folder: null, updated_at: "2026-01-01T00:00:00.000Z", snippet: null },
});

describe("useSearch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle() {
    await vi.runAllTimersAsync();
    for (let i = 0; i < 5; i++) await nextTick();
  }

  it("asks once the typing pauses, with the query", async () => {
    fetchMock.mockResolvedValue(ndjson([{ meta: { total: 1, hasMore: false } }, item("a", "Alpha")]));
    const { useSearch } = await import("../../composables/useSearch");
    const { query, results, total, searching } = useSearch();

    query.value = "al";
    await nextTick();
    query.value = "alp";
    await nextTick();
    expect(searching.value).toBe(true);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("search=alp");
    expect(results.value.map((r) => r.title)).toEqual(["Alpha"]);
    expect(total.value).toBe(1);
    expect(searching.value).toBe(false);
  });

  it("lets a newer query win over an older answer still arriving", async () => {
    let releaseOld!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((r) => (releaseOld = r)))
      .mockResolvedValueOnce(ndjson([{ meta: { total: 1, hasMore: false } }, item("n", "New")]));
    const { useSearch } = await import("../../composables/useSearch");
    const { query, results } = useSearch();

    query.value = "old";
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    query.value = "new";
    await nextTick();
    await settle();
    releaseOld(ndjson([{ meta: { total: 1, hasMore: false } }, item("o", "Old")]));
    await settle();

    expect(results.value.map((r) => r.title)).toEqual(["New"]);
  });

  it("empties at once when the box is cleared", async () => {
    fetchMock.mockResolvedValue(ndjson([{ meta: { total: 1, hasMore: false } }, item("a", "Alpha")]));
    const { useSearch } = await import("../../composables/useSearch");
    const { query, results, clear, searching } = useSearch();
    query.value = "alpha";
    await nextTick();
    await settle();
    expect(results.value).toHaveLength(1);

    clear();
    await nextTick();
    expect(results.value).toEqual([]);
    expect(searching.value).toBe(false);
  });
});
