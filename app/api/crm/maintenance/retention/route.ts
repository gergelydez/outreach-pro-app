import { route, json, HttpError } from '@/lib/crm/api'
import { purgeExpiredProviderData } from '@/lib/crm/businesses'
import { logActivity } from '@/lib/crm/activity'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Rulat zilnic de Vercel Cron (vezi vercel.json), autentificat cu CRON_SECRET.
export const GET = route(async (req: Request) => {
  // Cu CRON_SECRET setat, Vercel trimite Authorization: Bearer <secret>. Fără el acceptăm apelul
  // Vercel Cron (user-agent vercel-cron) — acțiunea doar șterge date Google expirate, deci e inofensivă.
  const secret = process.env.CRON_SECRET
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : (req.headers.get('user-agent') || '').startsWith('vercel-cron')
  if (!ok) throw new HttpError(401, 'Unauthorized')
  const r = await purgeExpiredProviderData()
  if (r.sources || r.businesses) await logActivity(null, 'retention', `Retention: removed ${r.sources} expired provider records, cleared Google fields on ${r.businesses} lead(s)`)
  return json({ ok: true, ...r })
})
