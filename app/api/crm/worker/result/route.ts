import { route, json, body, requireUuid, str, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { completeJob, failJob } from '@/lib/crm/jobs'
import { applyAudit } from '@/lib/crm/businesses'
import { logUsage } from '@/lib/crm/activity'
import { workerTokenOk } from '@/lib/crm/session'
import type { AuditFacts } from '@/lib/crm/audit-types'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Workerul raportează rezultatul: fie faptele observate (ok), fie o eroare de procesare
// (care declanșează reîncercare cu backoff). Un site căzut NU e o eroare de procesare —
// e un fapt (reachable: false) și se clasifică normal.
export const POST = route(async (req: Request) => {
  if (!workerTokenOk(req.headers.get('authorization'))) throw new HttpError(401, 'Invalid worker token')
  const b = await body<{ job_id?: string; ok?: boolean; facts?: AuditFacts; error?: string; retryable?: boolean; pagespeed_calls?: number }>(req)
  const jobId = requireUuid(b.job_id)
  const job = await one<{ business_id: string | null; status: string }>('SELECT business_id, status FROM audit_jobs WHERE id = $1', [jobId])
  if (!job) throw new HttpError(404, 'Job not found')
  if (job.status !== 'running') return json({ ok: true, ignored: `job is ${job.status}` }) // idempotent: rezultat dublu sau job anulat

  if (b.pagespeed_calls) await logUsage({ provider: 'pagespeed', operation: 'runPagespeed', units: b.pagespeed_calls, costUsd: 0 })

  if (!b.ok || !b.facts || typeof b.facts.reachable !== 'boolean') {
    const state = await failJob(jobId, str(b.error, 1000) || 'Worker error', b.retryable !== false)
    return json({ ok: true, state })
  }
  if (!job.business_id) { await completeJob(jobId); return json({ ok: true }) }
  try {
    const r = await applyAudit(job.business_id, b.facts)
    await completeJob(jobId)
    return json({ ok: true, ...r })
  } catch (e) {
    await failJob(jobId, e instanceof Error ? e.message : String(e))
    throw e
  }
})
