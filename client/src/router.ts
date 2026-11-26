import { createRouter, createWebHistory } from "vue-router";

import { useAuth } from "./composables/useAuth";

// The Nuxt app's pages/, as routes: the home graph, the login page, the new-note
// page, and every note at the root by its slug (or uuid). `login` and `new`
// win over `/:id` by being static; the server never lets a note take either
// slug.
//
// Each page is its own chunk, as Nuxt split them.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: () => import("./pages/HomePage.vue") },
    { path: "/login", component: () => import("./pages/LoginPage.vue"), meta: { bare: true } },
    { path: "/new", component: () => import("./pages/NewNotePage.vue"), meta: { auth: true } },
    { path: "/:id", component: () => import("./pages/NotePage.vue") },
    { path: "/:rest(.*)*", component: () => import("./pages/NotFoundPage.vue") },
  ],
});

declare module "vue-router" {
  interface RouteMeta {
    /** Drawn without the app shell (header, sidebar, footer). */
    bare?: boolean;
    /** Needs a signed-in user; anybody else is sent to /login. */
    auth?: boolean;
  }
}

// The server applies the same two rules to a page load (anonymous on /new →
// /login, signed in on /login → /); these cover navigating inside the app.
router.beforeEach((to) => {
  const { loggedIn } = useAuth();
  if (to.meta.auth && !loggedIn.value) return "/login";
  if (to.path === "/login" && loggedIn.value) return "/";
  return true;
});

export default router;
