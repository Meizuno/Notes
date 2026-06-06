import { getHeader, setHeader } from 'h3'
import { getPrisma } from '../utils/db'
import { authenticate } from '../utils/auth'
import { noteVisibilityWhere } from '../utils/notes'

// Runtime sitemap generation. Auth-aware:
//   - Anonymous request (e.g. Googlebot): only PUBLIC notes are
//     listed. This is the canonical sitemap that crawlers see.
//   - Authenticated session: every note the user can read, which
//     means PUBLIC + PROTECTED + their own PRIVATE notes. Useful for
//     the logged-in user to grab a full list of their vault URLs.
//
// The `/sitemap.xml` path bypasses the global auth middleware (it
// matches the "static-looking" filter), so we call `authenticate`
// explicitly here to populate `event.context.user` before consulting
// the visibility filter.

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&apos;'
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => XML_ESCAPE[c]!)
}

export default defineEventHandler(async (event) => {
  await authenticate(event)
  const authed = Boolean(event.context.user)

  const config = useRuntimeConfig()
  const configured = String(config.public.siteUrl || '').replace(/\/$/, '')
  // Fallback for dev: derive from the incoming request headers so
  // `pnpm dev` still produces valid absolute URLs without setting
  // NUXT_PUBLIC_SITE_URL.
  const host = getHeader(event, 'x-forwarded-host') ?? getHeader(event, 'host') ?? 'localhost:3000'
  const proto = getHeader(event, 'x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const siteUrl = configured || `${proto}://${host}`

  const db = getPrisma()
  const notes = await db.note.findMany({
    where: noteVisibilityWhere(viewerId(event)),
    select: { id: true, updated_at: true },
    orderBy: { updated_at: 'desc' }
  })

  const homeEntry =
    `  <url>` +
    `<loc>${escape(siteUrl + '/')}</loc>` +
    `<changefreq>daily</changefreq>` +
    `<priority>1.0</priority>` +
    `</url>`

  const noteEntries = notes.map(n =>
    `  <url>` +
    `<loc>${escape(`${siteUrl}/notes/${n.id}`)}</loc>` +
    `<lastmod>${n.updated_at.toISOString()}</lastmod>` +
    `<changefreq>weekly</changefreq>` +
    `<priority>0.8</priority>` +
    `</url>`
  )

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [homeEntry, ...noteEntries].join('\n') +
    `\n</urlset>\n`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Caching policy varies with auth state:
  //   - Anon: safe to share across visitors, cache at the edge for
  //     an hour. Google revisits often enough that anything more
  //     aggressive isn't worth it.
  //   - Authed: the response includes notes only this user can see,
  //     so never share it. `Vary: Cookie` keeps any well-behaved
  //     intermediate from mixing per-user responses.
  if (authed) {
    setHeader(event, 'cache-control', 'private, no-store')
    setHeader(event, 'vary', 'Cookie')
  }
  else {
    setHeader(event, 'cache-control', 'public, max-age=3600')
  }
  return body
})
