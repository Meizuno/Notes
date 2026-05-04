export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Knowledge Base' },
        { name: 'theme-color', content: '#f97316' }
      ]
    }
  },

  modules: ['@nuxt/ui', '@nuxtjs/mdc'],
  css: ['~/assets/css/main.css'],

  // Bundle every icon referenced in source into the client build, so
  // there are no runtime `/api/_nuxt_icon/*` fetches. `scan` walks the
  // project files for `i-<collection>-<name>` strings and component
  // `name` props.
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 256
    }
  },

  runtimeConfig: {
    authServiceUrl: ''
  },

  nitro: {
    routeRules: {
      // Static at build time → `.output/public/login/index.html`. Auth
      // middleware 302s logged-in users away from /login before the
      // static handler runs.
      '/login':  { prerender: true },
      // API responses: never cached at the Nitro layer; auth middleware
      // gates per-request.
      '/api/**': { cache: false }
    }
  }
})
