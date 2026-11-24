import { route, requireUuid, HttpError, json } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { loadSiteHtml, slugOf } from '@/lib/crm/demo'
import { publishScreenshot } from '@/lib/crm/screenshot'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

async function slugFor(id: string) {
  const b = await one<{ preview_url: string | null }>('SELECT preview_url FROM businesses WHERE id = $1', [requireUuid(id)])
  const slug = slugOf(b?.preview_url ?? null)
  if (!slug) throw new HttpError(404, 'Firma nu are încă un demo.')
  return slug
}

// Poza demo-ului (PNG). 404 dacă încă nu există → pagina cere POST ca s-o facă.
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const slug = await slugFor(params.id)
  const { getFile } = await import('@/lib/object-store')
  const f = await getFile(`previews/${slug}.png`).catch(() => null)
  if (!f) throw new HttpError(404, 'Poza nu e făcută încă.')
  return new Response(new Uint8Array(f.body), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="${slug}.png"` } })
})

// Face poza acum (pentru demo-urile făcute înainte de această funcție, sau după modificări)
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const slug = await slugFor(params.id)
  await publishScreenshot(slug, await loadSiteHtml(slug))
  return json({ ok: true })
})
