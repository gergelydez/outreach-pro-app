import { route } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { loadSiteHtml, slugOf } from '@/lib/crm/demo'
import { stripConceptBanner } from '@/lib/preview'
import { injectCmsScript } from '@/lib/crm/cms-shared'
import { withSiteFixes } from '@/lib/site-fixes'
import { normHost, hostOfUrl } from '@/lib/live-host'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const page = (status: number, title: string, text: string) => new Response(
  `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#334155;text-align:center;padding:16px"><div><h1 style="font-size:22px">${title}</h1><p>${text}</p></div></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=30' } })

// Site-ul final al clientului pe domeniul lui (middleware-ul trimite aici cererile de pe domeniile clienților)
export const GET = route(async (req: Request) => {
  const u = new URL(req.url)
  const host = normHost(u.searchParams.get('host') || '')
  const path = u.searchParams.get('path') || '/'
  if (path === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, s-maxage=3600' } })
  if (path !== '/' && path !== '/index.html') {
    if (/\.(ico|png|jpe?g|svg|webp|gif|txt|xml|js|css|map|json)$/i.test(path)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=300' } })
    return new Response(null, { status: 302, headers: { Location: '/' } })
  }
  const rows = await q<{ preview_url: string | null; live_url: string | null }>('SELECT preview_url, live_url FROM businesses WHERE live_url IS NOT NULL AND preview_url IS NOT NULL')
  const slug = slugOf(rows.find(r => hostOfUrl(r.live_url) === host)?.preview_url ?? null)
  if (!slug) return page(404, 'Site în pregătire', 'Acest domeniu nu e încă legat de un site.')
  const html = await loadSiteHtml(slug).catch(() => null)
  if (!html) return page(503, 'Site în pregătire', 'Revino în câteva minute.')
  // scriptul și datele vin de pe același domeniu (middleware-ul lasă /cms.js și /api/ să treacă)
  const out = withSiteFixes(injectCmsScript(stripConceptBanner(html), `https://${u.searchParams.get('host') || host}`, slug))
  return new Response(out, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' } })
})
