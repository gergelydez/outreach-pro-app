import { createHmac, timingSafeEqual } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { route, json, HttpError } from '@/lib/crm/api'
import { huntStep, MAX_STEPS_PER_DAY } from '@/lib/crm/hunt'
import { placesKey } from '@/lib/crm/providers/google-places'
import { logActivity } from '@/lib/crm/activity'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Rularea automată de dimineață (Vercel Cron, vezi vercel.json). Un apel face un pas
// (~45 s); dacă lista zilei nu are încă 50 de firme, se re-apelează singur pentru pasul următor.
// Necesită GOOGLE_PLACES_API_KEY în Vercel (cheia din Setări e doar în browser).

function chainToken(day: string): string {
  const secret = process.env.CRON_SECRET || process.env.BLOB_READ_WRITE_TOKEN || ''
  return createHmac('sha256', secret).update(`hunt-chain:${day}`).digest('hex')
}
function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function authorised(req: Request): boolean {
  const day = new Date().toISOString().slice(0, 10)
  const chain = req.headers.get('x-hunt-token') || ''
  if (chain && (process.env.CRON_SECRET || process.env.BLOB_READ_WRITE_TOKEN) && safeEq(chain, chainToken(day))) return true
  const secret = process.env.CRON_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  return (req.headers.get('user-agent') || '').startsWith('vercel-cron')
}

export const GET = route(async (req: Request) => {
  if (!authorised(req)) throw new HttpError(401, 'Unauthorized')
  if (!placesKey()) return json({ skipped: 'GOOGLE_PLACES_API_KEY is not set in Vercel — the automatic hunt needs it' })
  const url = new URL(req.url)
  const depth = Math.max(0, Number(url.searchParams.get('n') || 0))
  const r = await huntStep({ budgetMs: 40_000, auto: true })
  if (depth === 0) await logActivity(null, 'hunt_auto', `Automatic daily hunt started (list: ${r.pool}/${r.target})`)
  const keepGoing = !r.done && !r.stoppedReason && depth + 1 < MAX_STEPS_PER_DAY
  if (keepGoing) {
    const next = new URL(url.pathname, url.origin)
    next.searchParams.set('n', String(depth + 1))
    const day = new Date().toISOString().slice(0, 10)
    // nu așteptăm răspunsul pasului următor: doar îl pornim
    waitUntil(fetch(next, { headers: { 'x-hunt-token': chainToken(day) }, signal: AbortSignal.timeout(8000) }).then(() => undefined, () => undefined))
  }
  return json({ ...r, chained: keepGoing, depth })
})
