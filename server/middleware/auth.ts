import { sendRedirect, getHeader } from 'h3'

const SKIP_PATHS = [
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/_nuxt_icon/",
  "/api/health",
];

const LOGIN_PATH = '/login'

// Pages that anonymous visitors are allowed to load. The home page
// (graph + tree) and individual note pages render public notes only —
// data-layer filters in /api/notes/* handle the actual gating. Any
// page not listed here redirects anon visitors to /login.
//
// Note IDs are UUIDs, so /notes/<uuid> matches the read view. The
// edit-by-id path is the same URL with a query toggle, which is fine —
// anon hitting "Edit" gets a 401 from the PUT endpoint.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isPublicPage(path: string): boolean {
  const pathname = (path.split('?')[0] ?? path)
  if (pathname === '/' || pathname === LOGIN_PATH) return true
  const m = pathname.match(/^\/notes\/([^/]+)$/)
  return !!(m && m[1] && UUID_RE.test(m[1]))
}

export default defineEventHandler(async (event) => {
  const path = event.path ?? "";
  if (SKIP_PATHS.some((p) => path.startsWith(p))) return;

  const isApi = path.startsWith("/api/");
  const isStatic = path.includes(".");
  const isPage = !isApi && !isStatic;

  // Authenticate page and API requests.
  if (isApi || isPage) {
    await authenticate(event);
  }

  // Server-side page gating: unauthenticated page requests go to /login
  // unless they're explicitly listed as public (home + single-note
  // view). Already-logged-in users hitting /login bounce back to home.
  if (!isPage) return;
  const authed = Boolean(event.context.user);
  if (!authed && !isPublicPage(path)) return sendRedirect(event, LOGIN_PATH, 302);
  if (authed && path === LOGIN_PATH) return sendRedirect(event, '/', 302);
});
