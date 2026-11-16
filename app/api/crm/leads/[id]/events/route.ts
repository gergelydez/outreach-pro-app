import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { logActivity } from '@/lib/crm/activity'
import { changeStage, type BusinessRow } from '@/lib/crm/businesses'
import { getSettings } from '@/lib/crm/settings'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


type Ctx = { params: { id: string } }
const TYPES = ['contacted', 'follow_up', 'reply', 'call', 'meeting', 'opt_out', 'bounced'] as const

// Înregistrare manuală: am contactat / au răspuns / opt-out. La „contacted” se pot crea
// automat sarcini de follow-up (D+3, D+7, D+14) — doar remindere, nimic nu se trimite.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ event_type?: string; channel?: string; reply_status?: string; notes?: string; occurred_at?: string; schedule_follow_ups?: boolean }>(req)
  const type = TYPES.find(t => t === b.event_type)
  if (!type) throw new HttpError(400, 'Invalid event type')
  const biz = await one<BusinessRow>('SELECT * FROM businesses WHERE id = $1', [id])
  if (!biz) throw new HttpError(404, 'Lead not found')
  const when = b.occurred_at ? new Date(b.occurred_at) : new Date()
  const replyStatus = type === 'reply' && b.reply_status && ['positive', 'neutral', 'negative'].includes(b.reply_status) ? b.reply_status : null
  await q(`INSERT INTO outreach_events (business_id, channel, event_type, reply_status, notes, occurred_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, str(b.channel, 30), type, replyStatus, str(b.notes, 2000), when.toISOString()])

  if (type === 'contacted') {
    await q('UPDATE businesses SET last_contacted_at = $2, updated_at = now() WHERE id = $1', [id, when.toISOString()])
    if (['new_lead', 'researching', 'qualified', 'ready_to_contact'].includes(biz.stage)) await changeStage(id, 'contacted')
    if (b.schedule_follow_ups) {
      const { outreach } = await getSettings()
      for (let i = 0; i < outreach.follow_up_days.length; i++) {
        const days = outreach.follow_up_days[i]
        await q(`INSERT INTO follow_up_tasks (business_id, title, due_at, priority) VALUES ($1,$2,$3,$4)`,
          [id, `Follow-up ${i + 1} with ${biz.name}`, new Date(when.getTime() + days * 86400_000).toISOString(), i === 0 ? 'high' : 'normal'])
      }
      await q(`UPDATE businesses SET next_follow_up_at = $2 WHERE id = $1`, [id, new Date(when.getTime() + outreach.follow_up_days[0] * 86400_000).toISOString()])
    }
  }
  // reamintire trimisă: contactat → follow-up 1 → follow-up 2; bifăm cea mai apropiată sarcină de follow-up
  if (type === 'follow_up') {
    await q('UPDATE businesses SET last_contacted_at = $2, updated_at = now() WHERE id = $1', [id, when.toISOString()])
    const next = biz.stage === 'contacted' ? 'follow_up_1' : biz.stage === 'follow_up_1' ? 'follow_up_2' : null
    if (next) await changeStage(id, next)
    await q(`UPDATE follow_up_tasks SET status = 'done' WHERE id = (SELECT id FROM follow_up_tasks WHERE business_id = $1 AND status = 'open' ORDER BY due_at LIMIT 1)`, [id])
    const nextTask = await one<{ due_at: string }>(`SELECT due_at FROM follow_up_tasks WHERE business_id = $1 AND status = 'open' ORDER BY due_at LIMIT 1`, [id])
    await q('UPDATE businesses SET next_follow_up_at = $2 WHERE id = $1', [id, nextTask?.due_at ?? null])
  }
  if (type === 'reply') {
    await changeStage(id, replyStatus === 'positive' ? 'interested' : replyStatus === 'negative' ? 'lost' : 'replied')
    // un răspuns oprește follow-up-urile programate
    await q(`UPDATE follow_up_tasks SET status = 'cancelled' WHERE business_id = $1 AND status = 'open' AND title LIKE 'Follow-up %'`, [id])
  }
  if (type === 'opt_out') {
    for (const [kind, value] of [['business', id], ['email', biz.email?.toLowerCase()], ['phone', biz.phone_e164], ['domain', biz.website_domain], ['place', biz.google_place_id]] as [string, string | null | undefined][]) {
      if (value) await q(`INSERT INTO suppression_list (kind, value, reason) VALUES ($1,$2,'opted out') ON CONFLICT DO NOTHING`, [kind, value])
    }
    await q(`UPDATE follow_up_tasks SET status = 'cancelled' WHERE business_id = $1 AND status = 'open'`, [id])
    await changeStage(id, 'not_a_fit')
  }
  if (type === 'call' || type === 'meeting') await changeStage(id, 'call_meeting')
  await logActivity(id, `event_${type}`, `${type.replace('_', '-')}${b.channel ? ` via ${b.channel}` : ''}${replyStatus ? ` (${replyStatus})` : ''}${b.notes ? `: ${String(b.notes).slice(0, 80)}` : ''}`)
  return json({ ok: true })
})
