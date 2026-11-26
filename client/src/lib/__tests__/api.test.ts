import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import type { NoteListLine } from "../types";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the API module", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the note list line by line, with its query", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('{"meta":{"total":2,"hasMore":true}}\n{"item":{"id":"a","title":"A",'));
        controller.enqueue(enc.encode('"folder":null,"updated_at":"2026-01-01T00:00:00.000Z","snippet":"x"}}\n'));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" } }),
    );
    const lines: NoteListLine[] = [];
    for await (const line of api.listNotes({ search: "a b", folder: "", limit: 1 })) lines.push(line);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/notes?search=a+b&limit=1");
    expect(lines).toEqual([
      { meta: { total: 2, hasMore: true } },
      { item: { id: "a", title: "A", folder: null, updated_at: "2026-01-01T00:00:00.000Z", snippet: "x" } },
    ]);
  });

  it("addresses a note by its key as one path segment", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { deleted: "a/b" }));
    await api.deleteNote("a/b");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/notes/a%2Fb");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "DELETE" });
  });

  it("sends a note write as JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: "n" }));
    await api.updateNote("my-note", { content: "hi" });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/notes/my-note");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"content":"hi"}');
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("reads the sign-ins on offer, dev sign-in closed unless plainly open", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { google: true, devLogin: true }));
    expect(await api.authConfig()).toEqual({ google: true, devLogin: true });
    fetchMock.mockResolvedValueOnce(json(200, { google: false, devLogin: false }));
    expect(await api.authConfig()).toEqual({ google: false, devLogin: false });
    fetchMock.mockResolvedValueOnce(json(200, { devLogin: "yes" }));
    expect(await api.authConfig()).toEqual({ google: true, devLogin: false });
    fetchMock.mockResolvedValueOnce(json(404, { detail: "Not Found" }));
    expect(await api.authConfig()).toEqual({ google: true, devLogin: false });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await api.authConfig()).toEqual({ google: true, devLogin: false });
    // Never a refresh for it: the login page is for whoever has no session.
    expect(fetchMock.mock.calls.every((c) => String(c[0]) === "/api/auth/config")).toBe(true);
  });

  it("signs in with Google by navigating, and in dev by asking", async () => {
    expect(api.googleSignInUrl()).toBe("/api/auth/google");
    const user = { id: "u1", email: "a+b@example.com", name: null, picture: null };
    fetchMock.mockResolvedValueOnce(json(200, { user }));
    expect(await api.devSignIn("a+b@example.com")).toEqual({ user });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/auth/dev?email=a%2Bb%40example.com");
    fetchMock.mockResolvedValueOnce(
      json(403, { statusCode: 403, statusMessage: "Forbidden", message: "Not allowed", code: "not_allowed" }),
    );
    await expect(api.devSignIn("x@example.com")).rejects.toMatchObject({ status: 403, code: "not_allowed" });
    // A refused sign-in is not a lapsed session: no refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("unwraps the token lists and keeps the minted secret", async () => {
    const pat = { id: 7, name: "ai-chat", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null, expiresAt: null };
    fetchMock
      .mockResolvedValueOnce(json(200, { pats: [pat] }))
      .mockResolvedValueOnce(json(200, { token: "nt_secret", pat }))
      .mockResolvedValueOnce(json(200, { pats: [] }));
    expect(await api.listTokens()).toEqual([pat]);
    expect(await api.createToken("ai-chat")).toEqual({ token: "nt_secret", pat });
    expect(await api.revokeToken(7)).toEqual([]);
    const calls = fetchMock.mock.calls.map((c) => [String(c[0]), (c[1] as RequestInit | undefined)?.method ?? "GET"]);
    expect(calls).toEqual([
      ["/api/tokens", "GET"],
      ["/api/tokens", "POST"],
      ["/api/tokens/7", "DELETE"],
    ]);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).body).toBe('{"name":"ai-chat"}');
  });
});
