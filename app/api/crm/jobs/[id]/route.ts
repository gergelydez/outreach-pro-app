import { route, json, body, requireUuid, HttpError } from '@/lib/crm/api'
import { cancelJob, retryJob } from '@/lib/crm/jobs'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


type Ctx = { params: { id: string } }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const { action } = await body<{ action?: string }>(req)
  const ok = action === 'cancel' ? await cancelJob(id) : action === 'retry' ? await retryJob(id) : null
  if (ok === null) throw new HttpError(400, 'Unknown action')
  if (!ok) throw new HttpError(409, action === 'cancel' ? 'Only pending or dead jobs can be cancelled' : 'Only finished, dead or cancelled jobs can be retried')
  return json({ ok: true })
})
