import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadUser, useAuth } from "../../composables/useAuth";
import { useConfirm } from "../../composables/useConfirm";
import { formatMarkdown } from "../../composables/useMarkdownFormatter";
import { useNoteForm } from "../../composables/useNoteForm";
import { apiFetch } from "../http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the signed-in user", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is asked for at boot, refreshing an expired session once", async () => {
    const user = { id: "u1", email: "a@example.com", name: "A", picture: null };
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { user }));
    await loadUser();
    expect(useAuth().user.value).toEqual(user);
    expect(useAuth().loggedIn.value).toBe(true);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
  });

  it("is nobody when the session cannot be recovered", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { user: { id: "u1", email: null, name: null, picture: null } }));
    await loadUser();
    expect(useAuth().loggedIn.value).toBe(true);
    // Later, any call that ends in a 401 after its refresh clears the user.
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    await expect(apiFetch("/api/notes/tree")).rejects.toMatchObject({ status: 401 });
    expect(useAuth().user.value).toBeNull();
  });

  it("is cleared by logging out, even when the server cannot be reached", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { user: { id: "u1", email: null, name: null, picture: null } }));
    await loadUser();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await useAuth().logout();
    expect(useAuth().user.value).toBeNull();
    expect(String(fetchMock.mock.calls[1]![0])).toBe("/api/auth/logout");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST" });
  });
});

describe("the confirm dialog's promise", () => {
  it("resolves with the answer and closes", async () => {
    const { confirm, _state, _settle } = useConfirm();
    const asked = confirm({ title: "Delete note?" });
    expect(_state.open).toBe(true);
    expect(_state.opts?.title).toBe("Delete note?");
    _settle(true);
    expect(await asked).toBe(true);
    expect(_state.open).toBe(false);
  });

  it("answers a question left hanging with no before asking the next", async () => {
    const { confirm, _settle } = useConfirm();
    const first = confirm({ title: "One?" });
    const second = confirm({ title: "Two?" });
    expect(await first).toBe(false);
    _settle(true);
    expect(await second).toBe(true);
  });
});

describe("the note form's body", () => {
  it("collapses blank folder and description to null", () => {
    const form = useNoteForm();
    form.title.value = "T";
    form.folder.value = "  ";
    form.description.value = "";
    expect(form.toCreateInput()).toEqual({
      title: "T",
      content: "",
      folder: null,
      description: null,
      visibility: "PROTECTED",
      is_shared: false,
    });
  });

  it("is filled from a note for editing", () => {
    const form = useNoteForm();
    form.populate({
      title: "T",
      folder: "A/B",
      description: null,
      content: "# x",
      visibility: "PUBLIC",
      is_shared: true,
    });
    expect(form.toUpdateInput()).toMatchObject({ folder: "A/B", description: null, visibility: "PUBLIC", is_shared: true });
  });
});

describe("the Format button", () => {
  it("repairs pasted bullets and normalises the markdown", async () => {
    expect(await formatMarkdown("Ingredients:\n•flour\n•*sugar*\n\n\n* x")).toBe(
      "## Ingredients\n\n- flour\n- _sugar_\n\n* x\n",
    );
  });
});
