import { waitUntil } from '@vercel/functions'
import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { createPortal, startMarkup } from '@/lib/crm/portal'
import { loadSiteHtml, slugOf } from '@/lib/crm/demo'
import { hasCmsContent, hasCmsForm } from '@/lib/crm/cms-shared'
import { publicOrigin } from '@/lib/public-url'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// Starea panoului: există link? site-ul are deja marcajele?
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const p = await one<{ token: string }>('SELECT token FROM client_portals WHERE business_id = $1', [id])
  const acc = await one<{ email: string; last_login_at: string | null }>('SELECT email, last_login_at FROM client_accounts WHERE business_id = $1', [id])
  const b = await one<{ preview_url: string | null; live_url: string | null }>('SELECT preview_url, live_url FROM businesses WHERE id = $1', [id])
  const slug = slugOf(b?.preview_url ?? null)
  const ready = slug ? await loadSiteHtml(slug).then(h => hasCmsContent(h) && hasCmsForm(h)).catch(() => false) : false
  return json({ exists: !!p, link: p ? `${publicOrigin(req)}/edit/${p.token}` : null, ready, account: acc, live_url: b?.live_url ?? null })
})

// Activează panoul (sau un PIN nou, cu același link). Dacă site-ul nu are încă marcajele, Claude le adaugă în fundal.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ anthropic_key?: string; designer?: string; prepare_only?: boolean }>(req)
  const biz = await one<{ preview_url: string | null }>('SELECT preview_url FROM businesses WHERE id = $1', [id])
  if (!biz) throw new HttpError(404, 'Lead not found')
  const slug = slugOf(biz.preview_url)
  if (!slug) throw new HttpError(400, 'Fă mai întâi demo-ul site-ului.')
  // prepare_only: doar pregătește site-ul (fără cod nou pentru client)
  const portal = b.prepare_only ? null : await createPortal(id)
  const ready = await loadSiteHtml(slug).then(h => hasCmsContent(h) && hasCmsForm(h)).catch(() => false)
  let markup = 'ready'
  if (!ready) {
    const r = await startMarkup(id, { anthropicKey: str(b.anthropic_key, 300) || undefined, designer: str(b.designer, 60) || undefined }, { schedule: p => waitUntil(p) })
      .catch(e => { throw new HttpError(400, e instanceof Error ? e.message : String(e)) })
    markup = r.status
  }
  return json({ link: portal ? `${publicOrigin(req)}/edit/${portal.token}` : null, pin: portal?.pin ?? null, markup })
})
