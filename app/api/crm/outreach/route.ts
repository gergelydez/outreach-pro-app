import { route, json } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Toate mesajele (ciorne / trimise manual) și evenimentele recente, pe toate lead-urile
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const status = ['draft', 'sent', 'archived'].includes(sp.get('status') || '') ? sp.get('status') : null
  const channel = sp.get('channel')
  const params: unknown[] = []
  const cond: string[] = []
  if (status) { params.push(status); cond.push(`m.status = $${params.length}`) }
  if (channel) { params.push(channel); cond.push(`m.channel = $${params.length}`) }
  const messages = await q(`SELECT m.*, b.name AS business_name, b.city, b.stage, b.email AS business_email, b.phone AS business_phone, b.subscriber_type
                            FROM outreach_messages m JOIN businesses b ON b.id = m.business_id
                            ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY m.updated_at DESC LIMIT 200`, params)
  const events = await q(`SELECT e.*, b.name AS business_name FROM outreach_events e JOIN businesses b ON b.id = e.business_id ORDER BY e.occurred_at DESC LIMIT 50`)
  const counts = await q<{ status: string; n: string }>(`SELECT status, count(*)::text AS n FROM outreach_messages GROUP BY status`)
  return json({ messages, events, counts: Object.fromEntries(counts.map(c => [c.status, Number(c.n)])) })
})
