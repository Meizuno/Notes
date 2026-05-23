import { getHeader, setHeader } from 'h3'

// robots.txt — tells crawlers where the sitemap lives and which
// paths to leave alone (auth + edit flows, API surface). Public note
// pages (`/notes/<uuid>`) and the home page are crawlable by default.

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const configured = String(config.public.siteUrl || '').replace(/\/$/, '')
  const host = getHeader(event, 'x-forwarded-host') ?? getHeader(event, 'host') ?? 'localhost:3000'
  const proto = getHeader(event, 'x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const siteUrl = configured || `${proto}://${host}`

  const body =
    `User-agent: *\n` +
    `Disallow: /login\n` +
    `Disallow: /notes/new\n` +
    `Disallow: /api/\n` +
    `\n` +
    `Sitemap: ${siteUrl}/sitemap.xml\n`

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=86400')
  return body
})
