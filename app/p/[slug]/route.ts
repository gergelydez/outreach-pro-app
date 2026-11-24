import { getText } from '@/lib/object-store'
import { injectCmsScript } from '@/lib/crm/cms-shared'
import { withSiteFixes } from '@/lib/site-fixes'
import { publicOrigin } from '@/lib/public-url'

// Servește preview-ul publicat. CSP sandbox îi dă o origine opacă, ca
// scripturile din demo să nu poată citi localStorage-ul aplicației (chei API).

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return new Response('Not found', { status: 404 })

  try {
    const html = await getText(`previews/${slug}.html`)
    if (html == null) throw new Error('not found')
    // site cu panou de client: /cms.js aduce tarifele, ofertele, pozele și contactul la zi
    return new Response(withSiteFixes(injectCmsScript(html, publicOrigin(req), slug)), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      },
    })
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><title>Preview indisponibil</title><p style="font-family:system-ui;padding:40px">Acest preview nu mai este disponibil.</p>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
