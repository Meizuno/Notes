// Where the app is served from.
//
// Every URL this app emits — API calls, top-level navigations — is written
// root-absolute ("/api/notes", "/login"), which is right when the app owns
// the domain root: production behind Traefik, and `pnpm dev` on localhost.
//
// A dev server reached through a path-prefixing proxy is not at the root. With
// code-server's /absproxy/<port>/, the page lives under that prefix, and a
// root-absolute URL escapes it — /api/notes hits the proxy itself rather
// than Vite, which then never gets to forward it to the Python server. Vite puts the
// prefix it was configured with in BASE_URL, so prepending it keeps those URLs
// inside the app.
//
// BASE_URL is "/" everywhere else, where both helpers below are the identity.

// Trailing slash removed: callers pass paths that start with one.
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Prefix a root-absolute path with the base the app is served from. */
export function withBase(path: string): string {
  return BASE + path;
}

/**
 * Drop that prefix again, turning a browser path back into an app path — what
 * vue-router works in, since it prepends the base itself.
 */
export function stripBase(path: string): string {
  return BASE && path.startsWith(BASE) ? path.slice(BASE.length) || "/" : path;
}
