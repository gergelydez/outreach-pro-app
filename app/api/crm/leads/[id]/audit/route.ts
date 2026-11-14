import { route, json, requireUuid } from '@/lib/crm/api'
import { enqueueJob } from '@/lib/crm/jobs'
import { logActivity } from '@/lib/crm/activity'

type Ctx = { params: { id: string } }

// Pune în coadă un audit nou (îl rulează workerul Python)
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const jobId = await enqueueJob('audit', id, { manual: true }, { key: `audit:${id}:manual:${Math.floor(Date.now() / 60000)}` })
  if (jobId) await logActivity(id, 'audit_queued', 'Website audit queued')
  return json({ ok: true, job_id: jobId, queued: !!jobId })
})
