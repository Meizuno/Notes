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
      meta: [
        {
          name: "viewport",
          content:
            "width=device-width, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no viewport-fit=cover",
        },
      ],
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

  icon: {
    customCollections: [
      {
        prefix: "notes",
        dir: "./app/assets/icons",
      },
    ],
  },
});
