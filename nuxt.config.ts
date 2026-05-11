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

  // Shiki preloads + theme for code blocks. Both build-time content
  // and the runtime `/api/_mdc/highlight` endpoint use this config,
  // so listing a language here is required for it to render with
  // syntax highlighting at runtime — otherwise MDC falls back to
  // plain text and emits "Language X is not loaded" warnings.
  mdc: {
    highlight: {
      theme: {
        dark: 'github-dark',
        light: 'github-light'
      },
      langs: [
        'typescript', 'javascript', 'tsx', 'jsx', 'vue',
        'python', 'bash', 'shell', 'json', 'yaml',
        'html', 'css', 'scss', 'sql',
        'markdown', 'md', 'diff', 'go', 'rust',
        'dockerfile', 'ini', 'toml'
      ]
    }
  },

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
    authServiceUrl: '',
    // Shared secret ai-chat presents as `x-api-key` when calling
    // /api/prompts/* endpoints on behalf of a user. Empty in dev
    // disables API-key auth; the prompt endpoints fall back to the
    // user session in that case.
    mcpApiKey: ''
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
