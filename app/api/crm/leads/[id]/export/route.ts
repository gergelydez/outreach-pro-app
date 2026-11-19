import { route, requireUuid, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { loadSiteHtml, slugOf } from '@/lib/crm/demo'
import { stripConceptBanner } from '@/lib/preview'
import { zipSingleFile } from '@/lib/crm/zip'
import { injectCmsScript } from '@/lib/crm/cms-shared'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Site-ul final pentru client: arhivă .zip cu index.html, fără bannerul „concept”, gata de urcat în Cloudflare Pages.
export const GET = route(async (req: Request, { params }: { params: { id: string } }) => {
  const id = requireUuid(params.id)
  const b = await one<{ preview_url: string | null }>('SELECT preview_url FROM businesses WHERE id = $1', [id])
  const slug = slugOf(b?.preview_url ?? null)
  if (!slug) throw new HttpError(404, 'Firma nu are încă un site făcut.')
  // cu panou de client: site-ul publicat pe Cloudflare își ia tarifele, ofertele și pozele de la aplicație
  const html = injectCmsScript(stripConceptBanner(await loadSiteHtml(slug)), new URL(req.url).origin, slug)
  const zip = zipSingleFile('index.html', Buffer.from(html, 'utf8'))
  return new Response(new Uint8Array(zip), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${slug}.zip"`, 'Cache-Control': 'no-store' },
  })
})
