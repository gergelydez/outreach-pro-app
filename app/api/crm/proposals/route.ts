import { route, json, body, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { getSettings } from '@/lib/crm/settings'
import { logActivity } from '@/lib/crm/activity'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export const GET = route(async () => {
  return json({ proposals: await q(`SELECT p.id, p.title, p.status, p.total, p.currency, p.created_at, p.business_id, b.name AS business_name
                                     FROM proposals p JOIN businesses b ON b.id = p.business_id ORDER BY p.created_at DESC LIMIT 100`) })
})

// Propunere nouă pentru un lead, pornind de la serviciile alese (prețuri din Setări, editabile)
export const POST = route(async (req: Request) => {
  const b = await body<{ business_id?: string; service_keys?: string[] }>(req)
  const businessId = requireUuid(b.business_id)
  const biz = await one<{ name: string }>('SELECT name FROM businesses WHERE id = $1', [businessId])
  if (!biz) throw new HttpError(404, 'Lead not found')
  const settings = await getSettings()
  const keys = Array.isArray(b.service_keys) && b.service_keys.length ? b.service_keys : [settings.services[0]?.key]
  const items = settings.services.filter(s => keys.includes(s.key))
  const total = items.filter(i => !i.recurring).reduce((s, i) => s + i.price, 0)
  const p = await one<{ id: string }>(
    `INSERT INTO proposals (business_id, title, intro, scope, timeline, terms, currency, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [businessId, `Website proposal for ${biz.name}`, '', '', 'Timeline to be agreed after a short call.',
      'Prices exclude third-party costs (domain, hosting, paid plugins) unless stated. Final scope and payment terms are agreed in writing before work starts.',
      settings.business_profile.currency || 'GBP', total])
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    await q(`INSERT INTO proposal_items (proposal_id, description, quantity, unit_price, recurring, position) VALUES ($1,$2,1,$3,$4,$5)`, [p!.id, it.label, it.price, it.recurring || null, i])
  }
  await logActivity(businessId, 'proposal_created', 'Proposal draft created')
  return json({ id: p!.id })
})
