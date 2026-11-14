import { route, json, body, str, int, HttpError } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { claimJobs } from '@/lib/crm/jobs'
import { workerTokenOk } from '@/lib/crm/session'
import { normalizeName } from '@/lib/crm/normalize'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Workerul Python preia joburi (autentificat cu CRM_WORKER_TOKEN). Primește doar ce îi
// trebuie pentru audit: URL, nume, oraș, telefon — fără alte date din CRM.
export const POST = route(async (req: Request) => {
  if (!workerTokenOk(req.headers.get('authorization'))) throw new HttpError(401, 'Invalid worker token')
  const b = await body<{ worker_id?: string; limit?: number }>(req)
  const workerId = str(b.worker_id, 80) || 'worker'
  const jobs = await claimJobs(workerId, int(b.limit, 3, 1, 10))
  // heartbeat (arată în Settings că workerul rulează): la fiecare preluare de joburi, iar cu coada
  // goală cel mult o dată la 30 de minute — fiecare scriere înseamnă o salvare a bazei de date
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
           WHERE $3 OR app_settings.updated_at < now() - interval '30 minutes'`,
    [`worker:${workerId}`, JSON.stringify({ last_seen: new Date().toISOString() }), jobs.length > 0])
  if (!jobs.length) return json({ jobs: [] })
  const ids = jobs.map(j => j.business_id).filter(Boolean)
  const biz = await q<{ id: string; name: string; city: string | null; website_url: string | null; phone: string | null }>(
    'SELECT id, name, city, website_url, phone FROM businesses WHERE id = ANY($1)', [ids])
  const byId = new Map(biz.map(x => [x.id, x]))
  return json({
    jobs: jobs.map(j => {
      const b2 = j.business_id ? byId.get(j.business_id) : undefined
      return { id: j.id, type: j.type, attempts: j.attempts, business: b2 ? { ...b2, name_normalized: normalizeName(b2.name) } : null }
    }),
  })
})
