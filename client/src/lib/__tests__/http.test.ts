import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, errorMessage, setAuthLostHandler } from "../http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The paths fetch was called with, in order. */
const paths = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map((c) => String(c[0]));

describe("an API call", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let lost: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lost = vi.fn<() => void>();
    setAuthLostHandler(lost);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers with the parsed body", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { user: { id: "u1" } }));
    expect(await apiFetch("/api/auth/me")).toEqual({ user: { id: "u1" } });
    expect(paths(fetchMock)).toEqual(["/api/auth/me"]);
  });

  it("on a 401 refreshes once and replays the request", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { id: "n1" }));
    const body = JSON.stringify({ content: "x" });
    const answer = await apiFetch("/api/notes/n1", { method: "PUT", body });
    expect(answer).toEqual({ id: "n1" });
    expect(paths(fetchMock)).toEqual(["/api/notes/n1", "/api/auth/refresh", "/api/notes/n1"]);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST" });
    // The replay is the same request, body and all.
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: "PUT", body });
    expect(lost).not.toHaveBeenCalled();
  });

  it("gives up when the refresh fails, and says the session is gone", async () => {
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    const failure = await apiFetch("/api/auth/me").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect(paths(fetchMock)).toEqual(["/api/auth/me", "/api/auth/refresh"]);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("gives up when the replay is still refused", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(401, {}));
    await expect(apiFetch("/api/notes/tree")).rejects.toMatchObject({ status: 401 });
    expect(paths(fetchMock)).toEqual(["/api/notes/tree", "/api/auth/refresh", "/api/notes/tree"]);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh between requests refused at the same time", async () => {
    let refreshes = 0;
    let authed = false;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/refresh") {
        refreshes++;
        await new Promise((r) => setTimeout(r, 5));
        authed = true;
        return json(200, { ok: true });
      }
      return authed ? json(200, { url }) : json(401, {});
    });
    const answers = await Promise.all([apiFetch("/api/a"), apiFetch("/api/b"), apiFetch("/api/c")]);
    expect(answers).toEqual([{ url: "/api/a" }, { url: "/api/b" }, { url: "/api/c" }]);
    expect(refreshes).toBe(1);
  });

  it("does not refresh when asked not to", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: "nope" }));
    await expect(apiFetch("/api/auth/logout", { method: "POST", noRetry: true })).rejects.toMatchObject({
      status: 401,
      message: "nope",
    });
    expect(paths(fetchMock)).toEqual(["/api/auth/logout"]);
    expect(lost).not.toHaveBeenCalled();
  });

  it("fails with the server's own words", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { code: "not_found", message: "Note not found" }));
    await expect(apiFetch("/api/notes/x")).rejects.toMatchObject({ status: 404, code: "not_found", message: "Note not found" });
  });

  it("answers a 204 with nothing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await apiFetch("/api/x", { method: "DELETE" })).toBeUndefined();
  });
});

describe("an error body", () => {
  it("is read in each shape a server has answered with", () => {
    expect(errorMessage(400, '{"code":"invalid","message":"Title is required"}')).toEqual({
      code: "invalid",
      message: "Title is required",
    });
    expect(errorMessage(422, '{"detail":"Bad slug"}')).toEqual({ code: "unknown", message: "Bad slug" });
    expect(errorMessage(404, '{"statusCode":404,"statusMessage":"Note not found"}').message).toBe("Note not found");
    expect(errorMessage(502, "Bad Gateway").message).toBe("Bad Gateway");
    expect(errorMessage(500, "").message).toBe("Request failed (500)");
  });
});
