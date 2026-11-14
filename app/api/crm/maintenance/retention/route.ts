import { route, json, HttpError } from '@/lib/crm/api'
import { purgeExpiredProviderData } from '@/lib/crm/businesses'
import { logActivity } from '@/lib/crm/activity'

export const dynamic = 'force-dynamic'

// Rulat zilnic de Vercel Cron (vezi vercel.json), autentificat cu CRON_SECRET.
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized')
  const r = await purgeExpiredProviderData()
  if (r.sources || r.businesses) await logActivity(null, 'retention', `Retention: removed ${r.sources} expired provider records, cleared Google fields on ${r.businesses} lead(s)`)
  return json({ ok: true, ...r })
})
