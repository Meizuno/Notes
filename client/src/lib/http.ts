// The single place every API call goes through.
//
// The session is two cookies the server sets HttpOnly, so this file never sees
// them: a short-lived access token and a rotating refresh token.
//
// The server renews the session itself when the access token has expired, so a
// 401 normally means the session is genuinely over. This retry stays as a
// fallback for the cases the server cannot cover, and calls
// /api/auth/refresh once before giving up — what the Nuxt app's useAuth relied
// on the server middleware for.

import { withBase } from "./base";

type AuthLostHandler = () => void;

let onAuthLost: AuthLostHandler = () => {};

/** Registered by useAuth — called when a refresh cannot recover the session. */
export function setAuthLostHandler(fn: AuthLostHandler) {
  onAuthLost = fn;
}

// One shared refresh across concurrent 401s: a page that fires five requests at
// once must not rotate the refresh token five times. Rotation invalidates the
// previous token, so parallel refreshes would revoke each other and trip the
// server's reuse detection, logging the user out for no reason.
let refreshing: Promise<boolean> | null = null;

function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(withBase("/api/auth/refresh"), { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** A stable code when the server sends one ("not_found", …). */
    readonly code = "unknown",
  ) {
    super(message);
  }
}

export interface Options extends RequestInit {
  /** Skip the refresh-and-retry dance (used by the auth endpoints themselves). */
  noRetry?: boolean;
}

/**
 * The server's words for a failure. The Python server answers `{code,
 * message}` (Forma's shape) or FastAPI's `{detail}`; the Nuxt server answered
 * `{statusMessage, message}`. Anything else is shown as the raw text.
 */
export function errorMessage(status: number, body: string): { message: string; code: string } {
  const text = body.trim();
  let code = "unknown";
  let message = text || `Request failed (${status})`;
  try {
    const parsed = JSON.parse(text) as {
      code?: unknown;
      message?: unknown;
      statusMessage?: unknown;
      detail?: unknown;
    };
    if (typeof parsed.code === "string") code = parsed.code;
    const said = [parsed.message, parsed.detail, parsed.statusMessage].find(
      (m): m is string => typeof m === "string" && m.length > 0,
    );
    if (said) message = said;
  } catch {
    // not JSON — keep the raw text
  }
  return { message, code };
}

/**
 * Fetch an API route and hand back the successful Response, unread — what the
 * NDJSON list needs to read its body as a stream. Throws ApiError with the
 * server's message on failure.
 */
export async function apiResponse(path: string, opts: Options = {}): Promise<Response> {
  const { noRetry, ...init } = opts;
  const url = withBase(path);
  let res = await fetch(url, init);

  if (res.status === 401 && !noRetry) {
    if (await refresh()) {
      res = await fetch(url, init);
    }
    if (res.status === 401) {
      onAuthLost();
      throw new ApiError(401, "Unauthorized", "session_expired");
    }
  }

  if (!res.ok) {
    const { message, code } = errorMessage(res.status, await res.text());
    throw new ApiError(res.status, message, code);
  }
  return res;
}

/** Fetch an API route and parse the JSON body. */
export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await apiResponse(path, opts);
  // 204 No Content has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const JSON_HEADERS = { "Content-Type": "application/json" };
