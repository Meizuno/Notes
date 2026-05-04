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

  // Server-side page gating: unauthenticated page requests go to /login;
  // already-logged-in users hitting /login bounce back to home.
  if (!isPage) return;
  const authed = Boolean(event.context.user);
  if (!authed && path !== LOGIN_PATH) return sendRedirect(event, LOGIN_PATH, 302);
  if (authed && path === LOGIN_PATH) return sendRedirect(event, '/', 302);
});
