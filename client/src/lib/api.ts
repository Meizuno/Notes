import type {
  ApiToken,
  AuthConfig,
  CreateNoteInput,
  DeleteNoteResult,
  Graph,
  ListNotesQuery,
  MeResponse,
  MintedToken,
  Note,
  NoteListLine,
  TreeNote,
  UpdateNoteInput,
} from "./types";
import { withBase } from "./base";
import { apiFetch, apiResponse, JSON_HEADERS } from "./http";
import { readNdjson } from "./ndjson";

// Every call the pages make, typed end to end. The Nuxt app's useFetch /
// $fetch calls, one for one; each goes through apiFetch, which refreshes an
// expired session once and replays the request before giving up on it.

const post = (body: unknown): RequestInit => ({ method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
const put = (body: unknown): RequestInit => ({ method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(body) });
const del: RequestInit = { method: "DELETE" };

/** A note is addressed by slug or uuid; either way it is one path segment. */
const notePath = (key: string) => `/api/notes/${encodeURIComponent(key)}`;

function query(params: ListNotesQuery): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * Which sign-ins the server offers: GET /api/auth/config, `{google, devLogin}`.
 *
 * The one place to change if the server says it differently. Whatever goes
 * wrong — no such route, an error, another shape — reads as "Google only":
 * dev sign-in is a convenience for the dev stack, and production must never
 * offer it.
 */
async function authConfig(): Promise<AuthConfig> {
  try {
    const answer = await apiFetch<Partial<AuthConfig>>("/api/auth/config", { noRetry: true });
    return { google: answer?.google !== false, devLogin: answer?.devLogin === true };
  } catch {
    return { google: true, devLogin: false };
  }
}

export const api = {
  // ── auth ──────────────────────────────────────────────────────────────────
  me: () => apiFetch<MeResponse>("/api/auth/me"),
  // Best-effort and never retried: the session is being ended either way.
  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST", noRetry: true }),
  authConfig,
  /**
   * A top-level navigation, not a fetch: Google's round trip ends in
   * redirects, the last one to `back` (an app path; the server refuses
   * anything that is not local).
   */
  googleSignInUrl: (back = "/") => withBase(`/api/auth/google?return=${encodeURIComponent(back)}`),
  /**
   * Dev sign-in (NOTES_DEV_LOGIN only): answers like /api/auth/me with the
   * session cookies set. 403 `not_allowed` for an address off the allow-list,
   * 404 where it is switched off.
   */
  devSignIn: (email: string) =>
    apiFetch<MeResponse>(`/api/auth/dev?email=${encodeURIComponent(email)}`, { noRetry: true }),

  // ── notes ─────────────────────────────────────────────────────────────────
  getNote: (key: string) => apiFetch<Note>(notePath(key)),
  createNote: (input: CreateNoteInput) => apiFetch<Note>("/api/notes", post(input)),
  updateNote: (key: string, input: UpdateNoteInput) => apiFetch<Note>(notePath(key), put(input)),
  deleteNote: (key: string) => apiFetch<DeleteNoteResult>(notePath(key), del),
  /** Every note the viewer may see, oldest first — the sidebar tree and the form's folder list. */
  getTree: () => apiFetch<TreeNote[]>("/api/notes/tree"),
  getGraph: () => apiFetch<Graph>("/api/graph"),

  /**
   * GET /api/notes, read as the stream it is: `{meta}` first, then one
   * `{item}` per note as the server sends it.
   */
  async *listNotes(params: ListNotesQuery = {}): AsyncGenerator<NoteListLine> {
    const res = await apiResponse(`/api/notes${query(params)}`);
    if (!res.body) return;
    yield* readNdjson<NoteListLine>(res.body);
  },

  // ── personal API tokens (Forma's request and response shapes) ─────────────
  listTokens: () => apiFetch<{ pats: ApiToken[] }>("/api/tokens").then((r) => r.pats),
  createToken: (name: string) => apiFetch<MintedToken>("/api/tokens", post({ name })),
  /** Answers with what is left, so the list needs no second request. */
  revokeToken: (id: ApiToken["id"]) =>
    apiFetch<{ pats: ApiToken[] }>(`/api/tokens/${encodeURIComponent(String(id))}`, del).then((r) => r.pats),
};
