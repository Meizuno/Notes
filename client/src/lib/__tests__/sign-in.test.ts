import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// signIn() as the header, the router and /login use it. There is no sign-in
// page: it leaves for Google, or opens the dev dialog where that is the only
// way in. A fresh module per test, because the server's answer is kept.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("signIn", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = () => import("../../composables/useAuth");

  it("goes straight to Google, carrying the way back, and asks the server once", async () => {
    fetchMock.mockResolvedValue(json(200, { google: true, devLogin: false }));
    const { signIn } = await load();
    await signIn("/new?title=A");
    await signIn();
    expect(assign.mock.calls).toEqual([
      ["/api/auth/google?return=%2Fnew%3Ftitle%3DA"],
      ["/api/auth/google?return=%2F"],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens the dev dialog where the dev sign-in is the only way in", async () => {
    fetchMock.mockResolvedValue(json(200, { google: false, devLogin: true }));
    const { signIn, useAuth } = await load();
    await signIn("/some-note");
    expect(assign).not.toHaveBeenCalled();
    expect(useAuth().devSignIn.value).toEqual({ open: true, back: "/some-note" });
  });

  it("prefers Google where both are on", async () => {
    fetchMock.mockResolvedValue(json(200, { google: true, devLogin: true }));
    const { signIn, useAuth } = await load();
    await signIn();
    expect(assign).toHaveBeenCalledOnce();
    expect(useAuth().devSignIn.value.open).toBe(false);
  });

  it("still goes to Google where neither is on: the server says why it failed", async () => {
    fetchMock.mockResolvedValue(json(200, { google: false, devLogin: false }));
    const { signIn } = await load();
    await signIn();
    expect(assign).toHaveBeenCalledWith("/api/auth/google?return=%2F");
  });
});
