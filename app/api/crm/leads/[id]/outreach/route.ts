import { route, json, body, str, requireUuid, isUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { logActivity } from '@/lib/crm/activity'
import { OUTREACH_CHANNELS } from '@/lib/crm/constants'

type Ctx = { params: { id: string } }

// Ciorne de mesaje (manuale sau generate de AI). Aplicația NU trimite nimic:
// copiezi mesajul, îl trimiți tu, apoi îl marchezi „sent”.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ messages?: { channel?: string; subject?: string; body?: string; explanation_ro?: string }[]; source?: string; ai_analysis_id?: string }>(req)
  const items = (b.messages || []).filter(m => OUTREACH_CHANNELS.includes(m.channel as typeof OUTREACH_CHANNELS[number]) && str(m.body, 5000))
  if (!items.length) throw new HttpError(400, 'No valid messages')
  const out = []
  for (const m of items.slice(0, 10)) {
    out.push(await one(
      `INSERT INTO outreach_messages (business_id, channel, subject, body, explanation_ro, source, ai_analysis_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, m.channel, str(m.subject, 300), str(m.body, 5000), str(m.explanation_ro, 5000), b.source === 'ai' ? 'ai' : 'manual', isUuid(b.ai_analysis_id) ? b.ai_analysis_id : null]))
  }
  await logActivity(id, 'drafts_created', `${out.length} message draft(s) created`)
  return json({ messages: out })
})

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ message_id?: string; body?: string; subject?: string; status?: string }>(req)
  const mid = requireUuid(b.message_id)
  const status = b.status && ['draft', 'sent', 'archived'].includes(b.status) ? b.status : null
  const msg = await one<{ channel: string }>(
    `UPDATE outreach_messages SET body = COALESCE($3, body), subject = COALESCE($4, subject), status = COALESCE($5, status),
       sent_at = CASE WHEN $5 = 'sent' THEN now() ELSE sent_at END, updated_at = now()
     WHERE id = $1 AND business_id = $2 RETURNING channel`, [mid, id, str(b.body, 5000), str(b.subject, 300), status])
  if (!msg) throw new HttpError(404, 'Message not found')
  if (status === 'sent') {
    await q(`INSERT INTO outreach_events (business_id, message_id, channel, event_type) VALUES ($1,$2,$3,'contacted')`, [id, mid, msg.channel])
    await q('UPDATE businesses SET last_contacted_at = now(), updated_at = now() WHERE id = $1', [id])
    await logActivity(id, 'contacted', `Marked as sent manually (${msg.channel})`)
  }
  return json({ ok: true })
})
