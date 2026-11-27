import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

// Serving the dev server under a path prefix — code-server's /absproxy/<port>/,
// a tunnel — means every URL the app emits has to carry that prefix. DEV_BASE
// supplies it (with both slashes: "/absproxy/5173/"). Unset, base stays "/",
// which is what localhost and every production build use: the Python server
// serves dist/ at the root.
const devBase = process.env.DEV_BASE || "/";

// Where the proxy sends /api (and the two crawler files the server writes).
// compose.dev.yaml points it at the `server` service; outside compose the
// Python server is on this machine.
const apiTarget = process.env.DEV_API_TARGET || "http://localhost:8000";

// Everything the browser asks the Python server for rather than Vite. The app
// requests `${base}api/...` (see src/lib/base.ts), so each rule matches the
// prefixed path and strips the prefix back off before forwarding.
const proxied = ["api", "sitemap.xml", "robots.txt"];

export default defineConfig({
  plugins: [
    vue(),
    ui({
      // colorMode: false → Nuxt UI stops managing the theme. index.html follows
      // the OS light/dark preference by toggling the `dark` class on <html>,
      // which is all the Nuxt app's color-mode ever did (it had no switch).
      colorMode: false,
      // The family look of the owner's other apps (Forma's vite.config.ts):
      // slate neutrals, pill buttons, big soft cards, rounded fields, overlays
      // above the sticky header. Notes' own hue is violet, its logo's, where
      // Forma is emerald and English is blue — the glow under a primary button
      // is that violet (rgb 139 92 246, violet-500).
      ui: {
        colors: { primary: "violet", neutral: "slate" },
        card: {
          slots: { root: "rounded-[1.75rem] shadow-(--app-card-shadow) dark:shadow-none" },
          variants: {
            variant: {
              outline: { root: "bg-default ring-0 divide-y divide-default/60 dark:ring-1 dark:ring-white/6" },
            },
          },
        },
        button: {
          slots: { base: "rounded-full font-bold" },
          compoundVariants: [
            {
              color: "primary",
              variant: "solid",
              class: "shadow-[0_8px_18px_-10px_rgb(139_92_246/0.9)] dark:shadow-none",
            },
            {
              color: "neutral",
              variant: "soft",
              class:
                "bg-default shadow-[0_1px_2px_rgb(30_60_90/0.06),0_6px_14px_-8px_rgb(30_60_90/0.3)] hover:bg-elevated active:bg-elevated focus-visible:bg-elevated disabled:bg-default aria-disabled:bg-default dark:bg-elevated dark:shadow-none dark:hover:bg-accented/70",
            },
          ],
        },
        input: { slots: { base: "rounded-xl" } },
        textarea: { slots: { base: "rounded-2xl" } },
        badge: { slots: { base: "rounded-full" } },
        kbd: { base: "rounded-md" },
        modal: {
          slots: { overlay: "z-50 backdrop-blur-[2px]", content: "z-50", title: "text-lg font-extrabold" },
          variants: {
            fullscreen: { false: { content: "rounded-[1.75rem] shadow-2xl ring-0 dark:ring-1 dark:ring-white/8" } },
          },
        },
        slideover: { slots: { overlay: "z-50 backdrop-blur-[2px]", content: "z-50" } },
        popover: { slots: { content: "z-50 rounded-2xl shadow-xl ring-default/60" } },
        dropdownMenu: { slots: { content: "z-50 rounded-2xl p-1 shadow-xl ring-default/60", item: "before:rounded-xl" } },
        tooltip: { slots: { content: "z-50 rounded-lg" } },
        toast: { slots: { root: "rounded-2xl" } },
        tree: { slots: { link: "rounded-xl" } },
      },
      // Bundle every icon the source names (`i-lucide-*`, `i-simple-icons-*`)
      // plus Nuxt UI's own, so nothing is fetched from the Iconify API at
      // runtime — the Nuxt app's `icon.clientBundle`, option for option.
      icon: {
        clientBundle: {
          scan: true,
          sizeLimitKb: 256,
        },
      },
    }),
  ],
  base: devBase,
  // Spelled out so the dep pre-bundle is settled before the first request (see
  // Forma's vite.config.ts for the failure a mid-session re-bundle causes).
  optimizeDeps: {
    include: [
      "vue",
      "vue-router",
      "@iconify/vue",
      "marked",
      "dompurify",
      "d3-force",
      "shiki/core",
      "shiki/engine/javascript",
    ],
  },
  server: {
    // Vite rejects requests whose Host header it does not recognise (a DNS-
    // rebinding guard). Reaching this dev server through another hostname —
    // code-server, a tunnel — needs that hostname listed in DEV_ALLOWED_HOSTS
    // (comma-separated).
    allowedHosts: process.env.DEV_ALLOWED_HOSTS?.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    proxy: Object.fromEntries(
      proxied.map((path) => [
        `${devBase}${path}`,
        {
          target: apiTarget,
          rewrite: (url: string) => url.slice(devBase.length - 1),
          // The server's cookies are scoped by path (Forma's helpers: "/",
          // "/api", "/api/auth"). Under a prefix a browser would send none of
          // them back, so each is moved under the prefix, keeping its scope.
          // An exact-match map: every path the server sets must be listed.
          cookiePathRewrite:
            devBase === "/"
              ? undefined
              : { "/": devBase, "/api": `${devBase}api`, "/api/auth": `${devBase}api/auth` },
        },
      ]),
    ),
    // Without a prefix the HMR socket infers everything from the page. Behind a
    // proxy it would still dial the dev server's own port, so point it at the
    // port and scheme the browser actually sees (a TLS proxy: 443/wss).
    hmr:
      devBase === "/"
        ? undefined
        : {
            // `||`, not `??`: compose passes an unset variable through as an
            // empty string, and Number("") is 0 — a port nothing listens on.
            clientPort: Number(process.env.DEV_HMR_CLIENT_PORT || 443),
            protocol: process.env.DEV_HMR_PROTOCOL || "wss",
          },
  },
});
