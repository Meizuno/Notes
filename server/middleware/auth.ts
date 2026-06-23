import { sendRedirect } from 'h3'

const SKIP_PATHS = [
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/_nuxt_icon/",
  "/api/health",
];

const LOGIN_PATH = '/login'

// Top-level pages that require auth even though they look like a note
// slug. Note slugs can never take these values (reserved at creation in
// uniqueNoteSlug), so a `/new` hit is unambiguously the create page and
// anon visitors are redirected to /login.
const AUTH_REQUIRED_PAGES = new Set(['new'])

// Pages that anonymous visitors are allowed to load. Notes live at the
// root (`/<slug>`), so every single-segment page is public EXCEPT the
// auth-required ones above — actual note read access is gated downstream
// by the visibility filter (a note the viewer can't see just renders
// not-found), so the middleware only lets the page load. Any page that
// isn't public redirects anon visitors to /login.
function isPublicPage(path: string): boolean {
  const pathname = (path.split('?')[0] ?? path)
  if (pathname === '/' || pathname === LOGIN_PATH) return true
  const m = pathname.match(/^\/([^/]+)$/)
  return Boolean(m && m[1] && !AUTH_REQUIRED_PAGES.has(m[1]))
}

export default defineEventHandler(async (event) => {
  const path = event.path ?? "";

  // Notes used to live under `/notes/<key>`; they now serve at the root
  // (`/<slug>`). Permanently redirect the old page URLs so existing links
  // and bookmarks (incl. `/notes/<uuid>`) keep working — this runs before
  // the auth gate so an anonymous visitor on an old link isn't bounced to
  // /login first. `/api/notes/*` is untouched (it doesn't match here).
  const legacy = (path.split('?')[0] ?? path).match(/^\/notes\/([^/]+)$/)
  if (legacy?.[1]) return sendRedirect(event, `/${legacy[1]}`, 301)

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
