// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App as VueApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";

import App from "../../App.vue";
import router from "../../router";
import { loadUser } from "../../composables/useAuth";
import type { Graph, Note, TreeNote } from "../types";

// The whole app, mounted in jsdom against a fake server: what main.ts does,
// then a walk through the pages. Not a browser — layout and the graph's
// simulation are out of reach — but every page, the shell and Nuxt UI's
// components render, route and call the API as they would.

const NOTE: Note = {
  id: "0b7e3c1e-8c54-4a4e-9a51-3d2f7c0f1a11",
  slug: "first-note",
  title: "First note",
  folder: "Programming/Languages",
  description: "A note",
  content: [
    "Lead paragraph with a [link](/second-note) and [out](https://example.com).",
    "",
    "## Section A",
    "",
    "- [ ] task",
    "",
    "## Section B <!-- collapsed -->",
    "",
    "```ts",
    "const x = 1;",
    "```",
  ].join("\n"),
  visibility: "PUBLIC",
  is_shared: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-03T04:05:06.000Z",
};

const TREE: TreeNote[] = [
  { id: NOTE.id, slug: NOTE.slug, title: NOTE.title, folder: NOTE.folder, created_at: NOTE.created_at },
  { id: "n2", slug: "second-note", title: "Second note", folder: null, created_at: "2026-01-02T00:00:00.000Z" },
];

const GRAPH: Graph = {
  nodes: [
    { id: "folder:Programming", title: "Programming", type: "folder", folder: null, links: 1 },
    { id: NOTE.id, slug: NOTE.slug, title: NOTE.title, type: "note", folder: "Programming", links: 1 },
  ],
  edges: [{ source: NOTE.id, target: "folder:Programming" }],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (url === "/api/auth/me") return json(200, { user: { id: "u1", email: "a@example.com", name: "Alice", picture: null } });
  if (url === "/api/notes/tree") return json(200, TREE);
  if (url === "/api/graph") return json(200, GRAPH);
  if (url === `/api/notes/${NOTE.slug}` && method === "GET") return json(200, NOTE);
  if (url === `/api/notes/${NOTE.slug}` && method === "PUT") {
    return json(200, { ...NOTE, ...JSON.parse(String(init?.body)) });
  }
  return json(404, { detail: "Not Found" });
});

let app: VueApp;
let root: HTMLElement;

async function settle() {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  // What jsdom lacks and the shell's components ask for.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  await loadUser();
  root = document.createElement("div");
  document.body.append(root);
  app = createApp(App).use(router).use(ui);
  await router.push("/");
  await router.isReady();
  app.mount(root);
  await settle();
});

afterAll(() => {
  app.unmount();
  vi.unstubAllGlobals();
});

describe("the app", () => {
  it("draws the shell for a signed-in user", () => {
    expect(root.querySelector("header")?.textContent).toContain("Notes");
    expect(root.querySelector('a[href="/new"]')).not.toBeNull();
    expect(root.querySelector("footer")?.textContent).toContain("Obsidian");
    expect(document.title).toBe("Notes");
  });

  it("lists the vault in the sidebar tree", () => {
    const aside = root.querySelector("aside")!;
    expect(aside.textContent).toContain("2 notes");
    expect(aside.textContent).toContain("Programming");
    expect(aside.textContent).toContain("Second note");
  });

  it("draws the graph on the home page", () => {
    const graph = root.querySelector(".graph-root")!;
    expect(graph.querySelectorAll("g[data-node]")).toHaveLength(2);
    expect(graph.querySelectorAll("line.edge")).toHaveLength(1);
    expect(graph.textContent).toContain("First note");
  });

  it("opens a note with its sections, folds and links", async () => {
    await router.push(`/${NOTE.slug}`);
    await settle();
    const main = root.querySelector("main")!;
    expect(main.querySelector("h1")?.textContent).toBe("First note");
    expect(main.textContent).toContain("Programming/Languages");
    expect(main.textContent).toContain("Last updated: February 3, 2026");
    expect(document.title).toBe("First note");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index, follow");

    const prose = main.querySelector(".prose")!;
    const headings = Array.from(prose.querySelectorAll(".kb-heading"));
    expect(headings.map((h) => h.textContent?.trim())).toEqual(["Section A", "Section B"]);
    expect(headings.map((h) => h.classList.contains("is-collapsed"))).toEqual([false, true]);
    const folds = Array.from(prose.querySelectorAll(".kb-fold-block"));
    expect(folds.map((f) => f.classList.contains("is-folded"))).toEqual([false, true]);

    const out = prose.querySelector<HTMLAnchorElement>('a[href="https://example.com"]')!;
    expect(out.target).toBe("_blank");
    expect(prose.querySelector('a[data-kb-route="/second-note"]')).not.toBeNull();
    expect(prose.querySelector("[data-kb-copy]")).not.toBeNull();
    const box = prose.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    expect(box.disabled).toBe(false);
  });

  it("folds a section by writing the marker back into the note", async () => {
    fetchMock.mockClear();
    const heading = root.querySelector<HTMLElement>(".kb-heading")!;
    heading.click();
    await settle();
    expect(heading.classList.contains("is-collapsed")).toBe(true);
    const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(put?.[0]).toBe(`/api/notes/${NOTE.slug}`);
    expect(String(put?.[1]?.body)).toContain("## Section A <!-- collapsed -->");
  });

  it("follows an internal link inside the note through the router", async () => {
    const link = root.querySelector<HTMLAnchorElement>('main a[data-kb-route="/second-note"]')!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await settle();
    expect(router.currentRoute.value.path).toBe("/second-note");
    // That one does not exist on the fake server.
    expect(root.querySelector("main")?.textContent).toContain("Note not found.");
  });

  it("shows the editor with its preview on /new", async () => {
    await router.push("/new?title=Hello&folder=A/B");
    await settle();
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("main input"));
    expect(inputs.map((i) => i.value)).toContain("Hello");
    expect(inputs.map((i) => i.value)).toContain("A/B");
    expect(root.querySelector("main textarea")).not.toBeNull();
    expect(root.querySelector("main")?.textContent).toContain("Shared link");
  });

  it("sends a signed-in visitor away from /login", async () => {
    await router.push("/login");
    await settle();
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("answers an unknown path with the not-found page", async () => {
    await router.push("/a/b/c");
    await settle();
    expect(root.querySelector("main")?.textContent).toContain("Page not found");
  });
});
