// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  modules: ["nitro-cloudflare-dev", "@nuxt/ui", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],

  app: {
    head: {
      title: "Notes",
      link: [{ rel: "icon", type: "image/svg", href: "/favicon.svg" }],
    },
  },

  runtimeConfig: {
    oauth: {
      google: {
        clientId: "...",
        clientSecret: "...",
      },
    },
  },

  imports: {
    dirs: ["types"],
  },

  icon: {
    customCollections: [
      {
        prefix: "notes",
        dir: "./app/assets/icons",
      },
    ],
  },
});
