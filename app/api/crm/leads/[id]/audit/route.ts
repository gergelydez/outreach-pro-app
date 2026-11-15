import { route, json, requireUuid } from '@/lib/crm/api'
import { enqueueJob } from '@/lib/crm/jobs'
import { logActivity } from '@/lib/crm/activity'
import { runPendingAudits } from '@/lib/crm/audit-runner'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


type Ctx = { params: { id: string } }

// Auditează site-ul acum, direct în aplicație (workerul Python nu mai e necesar)
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const jobId = await enqueueJob('audit', id, { manual: true }, { key: `audit:${id}:manual:${Math.floor(Date.now() / 60000)}` })
  if (jobId) await logActivity(id, 'audit_queued', 'Website audit started')
  const r = await runPendingAudits(4)
  return json({ ok: true, job_id: jobId, queued: !!jobId, result: r.processed.find(p => p.business_id === id) || null })
})
