import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one, db } from '@/lib/crm/db'
import { getSettings } from '@/lib/crm/settings'
import { changeStage } from '@/lib/crm/businesses'
import { logActivity } from '@/lib/crm/activity'

export const dynamic = 'force-dynamic'
type Ctx = { params: { id: string } }

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const proposal = await one(`SELECT p.*, b.name AS business_name, b.address AS business_address, b.email AS business_email, b.city AS business_city
                              FROM proposals p JOIN businesses b ON b.id = p.business_id WHERE p.id = $1`, [id])
  if (!proposal) throw new HttpError(404, 'Proposal not found')
  const items = await q('SELECT * FROM proposal_items WHERE proposal_id = $1 ORDER BY position', [id])
  const settings = await getSettings()
  return json({ proposal, items, seller: settings.business_profile, services: settings.services })
})

interface ItemIn { description?: string; quantity?: number; unit_price?: number; recurring?: string | null }

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ title?: string; intro?: string; scope?: string; timeline?: string; terms?: string; status?: string; items?: ItemIn[] }>(req)
  const status = b.status && ['draft', 'sent', 'accepted', 'declined'].includes(b.status) ? b.status : null
  const businessId = await db().transaction(async tx => {
    const row = await one<{ business_id: string }>(
      `UPDATE proposals SET title = COALESCE($2, title), intro = COALESCE($3, intro), scope = COALESCE($4, scope), timeline = COALESCE($5, timeline),
         terms = COALESCE($6, terms), status = COALESCE($7, status), updated_at = now() WHERE id = $1 RETURNING business_id`,
      [id, str(b.title, 200), b.intro != null ? String(b.intro).slice(0, 5000) : null, b.scope != null ? String(b.scope).slice(0, 8000) : null,
        b.timeline != null ? String(b.timeline).slice(0, 1000) : null, b.terms != null ? String(b.terms).slice(0, 5000) : null, status], tx)
    if (!row) throw new HttpError(404, 'Proposal not found')
    if (Array.isArray(b.items)) {
      await q('DELETE FROM proposal_items WHERE proposal_id = $1', [id], tx)
      let total = 0
      const list = b.items.slice(0, 30)
      for (let i = 0; i < list.length; i++) {
        const it = list[i]
        const desc = str(it.description, 300)
        if (!desc) continue
        const qty = Math.max(0, Number(it.quantity) || 1), price = Math.max(0, Number(it.unit_price) || 0)
        const recurring = it.recurring === 'monthly' ? 'monthly' : null
        if (!recurring) total += qty * price
        await q('INSERT INTO proposal_items (proposal_id, description, quantity, unit_price, recurring, position) VALUES ($1,$2,$3,$4,$5,$6)', [id, desc, qty, price, recurring, i], tx)
      }
      await q('UPDATE proposals SET total = $2 WHERE id = $1', [id, total], tx)
    }
    return row.business_id
  })
  if (status === 'sent') {
    await changeStage(businessId, 'proposal_sent')
    await logActivity(businessId, 'proposal_sent', 'Proposal marked as sent')
  }
  if (status === 'accepted') await changeStage(businessId, 'won')
  return json({ ok: true })
})

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  await q('DELETE FROM proposals WHERE id = $1', [requireUuid(params.id)])
  return json({ ok: true })
})
