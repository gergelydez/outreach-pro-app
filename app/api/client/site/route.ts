import { route, HttpError } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { loadSiteHtml, slugOf } from '@/lib/crm/demo'
import { stripConceptBanner } from '@/lib/preview'
import { withSiteFixes } from '@/lib/site-fixes'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Site-ul clientului pentru editorul vizual și previzualizare: datele vin de la aplicație (nepublicate încă)
export const GET = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const slug = slugOf(a.preview_url)
  if (!slug) throw new HttpError(404, 'no site')
  let html = stripConceptBanner(await loadSiteHtml(slug)).replace(/<script[^>]*src="[^"]*\/cms\.js"[^>]*><\/script>/g, '')
  const tag = '<script src="/cms.js" data-mode="editor"></script>'
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}\n</body>`) : html + tag
  return new Response(withSiteFixes(html), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
})
