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

  modules: ["nitro-cloudflare-dev", "@nuxt/ui", "nuxt-auth-utils", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],

  app: {
    head: {
      title: "Notes",
      link: [
        { rel: "icon", type: "image/svg", href: "/favicon.svg" },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/icons/apple-icon.png",
        },
      ],
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

  i18n: {
    strategy: "no_prefix",
    defaultLocale: "en",
    locales: [
      { code: "en", name: "English", file: "en.json" },
      { code: "cs", name: "Czech", file: "cs.json" },
      { code: "ua", name: "Ukrainian", file: "ua.json" },
    ],
  },
});
