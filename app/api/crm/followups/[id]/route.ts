import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { logActivity } from '@/lib/crm/activity'

type Ctx = { params: { id: string } }

async function syncNext(businessId: string | null) {
  if (businessId) await q(`UPDATE businesses SET next_follow_up_at = (SELECT min(due_at) FROM follow_up_tasks WHERE business_id = $1 AND status = 'open') WHERE id = $1`, [businessId])
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ status?: string; due_at?: string; title?: string; notes?: string; priority?: string }>(req)
  const status = b.status && ['open', 'done', 'cancelled'].includes(b.status) ? b.status : null
  const task = await one<{ business_id: string | null; title: string }>(
    `UPDATE follow_up_tasks SET status = COALESCE($2, status), due_at = COALESCE($3, due_at), title = COALESCE($4, title), notes = COALESCE($5, notes),
       priority = COALESCE($6, priority), completed_at = CASE WHEN $2 = 'done' THEN now() WHEN $2 = 'open' THEN NULL ELSE completed_at END
     WHERE id = $1 RETURNING business_id, title`,
    [id, status, b.due_at && !isNaN(Date.parse(b.due_at)) ? new Date(b.due_at).toISOString() : null, str(b.title, 200), str(b.notes, 2000),
      b.priority && ['low', 'normal', 'high'].includes(b.priority) ? b.priority : null])
  if (!task) throw new HttpError(404, 'Task not found')
  await syncNext(task.business_id)
  if (status === 'done' && task.business_id) await logActivity(task.business_id, 'follow_up_done', `Completed: ${task.title}`)
  return json({ ok: true })
})

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const task = await one<{ business_id: string | null }>('DELETE FROM follow_up_tasks WHERE id = $1 RETURNING business_id', [id])
  await syncNext(task?.business_id ?? null)
  return json({ ok: true })
})
