// The shapes the server answers with, field for field.
//
// The Nuxt app shared these with its server through shared/schemas/note.ts;
// the server is Python now, so they are written down here and kept to its JSON
// exactly — snake_case where the notes API has always spoken it, and timestamps
// as the ISO strings they are on the wire.

/** Who may read a note. The Postgres enum `note_visibility`. */
export type Visibility = "PRIVATE" | "PROTECTED" | "PUBLIC";

export const VISIBILITY_VALUES: readonly Visibility[] = ["PRIVATE", "PROTECTED", "PUBLIC"];

/**
 * One note, as GET/POST /api/notes and GET/PUT /api/notes/{key} return it (the
 * server's NoteRow projection — never user_id or is_deleted).
 */
export interface Note {
  id: string;
  slug: string;
  title: string;
  folder: string | null;
  description: string | null;
  content: string;
  visibility: Visibility;
  /** Readable by anyone holding the URL. Always true for a PUBLIC note. */
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

/** POST /api/notes. Only `title` is required; the server fills the rest. */
export interface CreateNoteInput {
  title: string;
  content?: string;
  folder?: string | null;
  description?: string | null;
  visibility?: Visibility;
  is_shared?: boolean;
}

/** PUT /api/notes/{key}. A key left out is left unchanged. */
export interface UpdateNoteInput {
  title?: string;
  content?: string;
  folder?: string | null;
  description?: string | null;
  visibility?: Visibility;
  is_shared?: boolean;
}

/** DELETE /api/notes/{key} — echoes the key it was given. */
export interface DeleteNoteResult {
  deleted: string;
}

/** One row of GET /api/notes/tree (oldest first). */
export interface TreeNote {
  id: string;
  slug: string;
  title: string;
  folder: string | null;
  created_at: string;
}

/** GET /api/graph: notes and the folder pseudo-nodes they hang off. */
export interface GraphNode {
  /** A note's uuid, or `folder:<full path>` for a folder. Opaque. */
  id: string;
  /** Note nodes only — drives the /<slug> link. */
  slug?: string;
  title: string;
  type: "note" | "folder";
  /** The parent folder path; null at the root. */
  folder: string | null;
  /** Degree. */
  links: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** GET /api/notes query. Every field optional; the server has the defaults. */
export interface ListNotesQuery {
  search?: string;
  folder?: string;
  /** 1–100, default 20. */
  limit?: number;
  offset?: number;
}

/** The first NDJSON line of GET /api/notes. */
export interface NoteListMeta {
  total: number;
  hasMore: boolean;
}

/** Every NDJSON line after the first. No slug: the list has never carried one. */
export interface NoteListItem {
  id: string;
  title: string;
  folder: string | null;
  updated_at: string;
  snippet: string | null;
}

/** One line of the GET /api/notes stream: `{"meta":…}` first, then `{"item":…}` each. */
export type NoteListLine = { meta: NoteListMeta } | { item: NoteListItem };

/** The signed-in user, as GET /api/auth/me answers. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface MeResponse {
  user: AuthUser;
}

/** GET /api/auth/config: which sign-ins this deployment offers. */
export interface AuthConfig {
  /** Google sign-in is configured. */
  google: boolean;
  /** GET /api/auth/dev?email=… is open (NOTES_DEV_LOGIN, never in the image). */
  devLogin: boolean;
}

/**
 * A personal API token, as the server lists it — Forma's `Pat` without its
 * scopes (a notes token has none). The secret is not here: it comes back
 * once, from the create call, and never again.
 */
export interface ApiToken {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** POST /api/tokens: the raw token, the only time it exists outside the server. */
export interface MintedToken {
  token: string;
  pat: ApiToken;
}
