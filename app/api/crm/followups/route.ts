import { route, json, body, str, isUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { logActivity } from '@/lib/crm/activity'

export const dynamic = 'force-dynamic'

// Sarcini de follow-up: azi, întârziate, viitoare, plus interval pentru calendar
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from'), to = sp.get('to')
  const base = `SELECT t.*, b.name AS business_name, b.city, b.stage FROM follow_up_tasks t LEFT JOIN businesses b ON b.id = t.business_id`
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json({ tasks: await q(`${base} WHERE t.due_at >= $1::date AND t.due_at < ($2::date + interval '1 day') ORDER BY t.due_at`, [from, to]) })
  }
  const [overdue, today, upcoming, done] = await Promise.all([
    q(`${base} WHERE t.status = 'open' AND t.due_at < date_trunc('day', now()) ORDER BY t.due_at`),
    q(`${base} WHERE t.status = 'open' AND t.due_at >= date_trunc('day', now()) AND t.due_at < date_trunc('day', now()) + interval '1 day' ORDER BY t.due_at`),
    q(`${base} WHERE t.status = 'open' AND t.due_at >= date_trunc('day', now()) + interval '1 day' ORDER BY t.due_at LIMIT 100`),
    q(`${base} WHERE t.status = 'done' ORDER BY t.completed_at DESC LIMIT 20`),
  ])
  return json({ overdue, today, upcoming, done })
})

export const POST = route(async (req: Request) => {
  const b = await body<{ business_id?: string; title?: string; notes?: string; due_at?: string; priority?: string }>(req)
  const title = str(b.title, 200)
  if (!title || !b.due_at || isNaN(Date.parse(b.due_at))) throw new HttpError(400, 'Title and a valid due date are required')
  const businessId = isUuid(b.business_id) ? b.business_id : null
  const task = await one(`INSERT INTO follow_up_tasks (business_id, title, notes, due_at, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [businessId, title, str(b.notes, 2000), new Date(b.due_at).toISOString(), ['low', 'normal', 'high'].includes(String(b.priority)) ? b.priority : 'normal'])
  if (businessId) {
    await q(`UPDATE businesses SET next_follow_up_at = (SELECT min(due_at) FROM follow_up_tasks WHERE business_id = $1 AND status = 'open') WHERE id = $1`, [businessId])
    await logActivity(businessId, 'follow_up_scheduled', `Follow-up scheduled: ${title}`)
  }
  return json({ task })
})
