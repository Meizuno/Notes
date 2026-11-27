import { createRouter, createWebHistory } from "vue-router";

import { signIn, useAuth } from "./composables/useAuth";

// The Nuxt app's pages/, as routes: the home graph, the new-note page, and
// every note at the root by its slug (or uuid). `new` wins over `/:id` by
// being static; the server never lets a note take it, nor `login`, which the
// guard below handles.
//
// Each page is its own chunk, as Nuxt split them.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // The window scrolls (the header is sticky over it): a new page starts at
  // its top, and back / forward return to where the reader was.
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? false : { top: 0 }),
  routes: [
    { path: "/", component: () => import("./pages/HomePage.vue") },
    { path: "/new", component: () => import("./pages/NewNotePage.vue"), meta: { auth: true } },
    { path: "/:id", component: () => import("./pages/NotePage.vue") },
    { path: "/:rest(.*)*", component: () => import("./pages/NotFoundPage.vue") },
  ],
});

declare module "vue-router" {
  interface RouteMeta {
    /** Needs a signed-in user; anybody else is sent to sign in first. */
    auth?: boolean;
  }
}

// The server applies the same rules to a page load (anonymous on /new or
// /login → Google, signed in on /login → /); these cover navigating inside
// the app, and the dev server, where Vite serves the pages.
router.beforeEach((to, from) => {
  const { loggedIn } = useAuth();
  if (to.path === "/login") {
    // Old links and bookmarks: there is no sign-in page any more.
    if (!loggedIn.value) void signIn(typeof to.query.return === "string" ? to.query.return : "/");
    return "/";
  }
  if (to.meta.auth && !loggedIn.value) {
    void signIn(to.fullPath);
    // Stay where they were while the browser leaves for Google; a first load
    // has nowhere to stay, so home.
    return from.matched.length ? false : "/";
  }
  return true;
});

export default router;
