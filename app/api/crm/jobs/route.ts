import { route, json } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { jobCounts } from '@/lib/crm/jobs'

export const dynamic = 'force-dynamic'

// Monitor pentru coada de audituri
export const GET = route(async (req: Request) => {
  const status = new URL(req.url).searchParams.get('status')
  const valid = ['pending', 'running', 'done', 'failed', 'dead', 'cancelled'].includes(status || '')
  const jobs = await q(`SELECT j.id, j.type, j.status, j.attempts, j.max_attempts, j.run_after, j.locked_at, j.locked_by, j.last_error, j.created_at, j.updated_at,
                               j.business_id, b.name AS business_name, b.website_url
                        FROM audit_jobs j LEFT JOIN businesses b ON b.id = j.business_id
                        ${valid ? 'WHERE j.status = $1' : ''} ORDER BY j.updated_at DESC LIMIT 100`, valid ? [status] : [])
  const lastSeen = await q(`SELECT substr(key, 8) AS locked_by, updated_at AS last_seen FROM app_settings WHERE key LIKE 'worker:%' ORDER BY updated_at DESC LIMIT 5`)
  return json({ counts: await jobCounts(), jobs, workers: lastSeen })
})
