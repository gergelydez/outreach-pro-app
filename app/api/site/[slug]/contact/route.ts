import { route, json, HttpError } from '@/lib/crm/api'
import { receiveSiteMessage, MessageError } from '@/lib/crm/site-messages'

// Formularul de contact de pe site-ul clientului (alt domeniu → CORS deschis)
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

const handler = route(async (req: Request, { params }: { params: { slug: string } }) => {
  if (!/^[a-z0-9-]{3,60}$/.test(params.slug)) throw new HttpError(404, 'not found')
  const type = req.headers.get('content-type') || ''
  const input = type.includes('json') ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData().catch(() => new FormData())).entries())
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  const r = await receiveSiteMessage(params.slug, input, ip).catch(e => { if (e instanceof MessageError) throw new HttpError(e.status, e.message); throw e })
  return json({ ok: r.ok })
})

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const res = await handler(req, ctx)
  const h = new Headers(res.headers)
  Object.entries(CORS).forEach(([k, v]) => h.set(k, v))
  return new Response(res.body, { status: res.status, headers: h })
}
