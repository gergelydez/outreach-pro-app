import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { ownDomain } from '@/lib/crm/businesses'
import { auditBusinessNow } from '@/lib/crm/audit-runner'
import { logActivity } from '@/lib/crm/activity'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// „Are site”: utilizatorul a găsit site-ul pe Google → îl salvăm și îl auditam imediat
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<{ url?: string }>(req)
  let url = (str(b.url, 300) || '').trim()
  if (!url) throw new HttpError(400, 'Lipsește linkul site-ului')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new HttpError(400, 'Link invalid') }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) throw new HttpError(400, 'Link invalid')
  const exists = await one<{ id: string }>('SELECT id FROM businesses WHERE id = $1', [id])
  if (!exists) throw new HttpError(404, 'Lead not found')
  const src = JSON.stringify({ website_url: { source: 'manual', verified: true, checked_at: new Date().toISOString() } })
  await q(`UPDATE businesses SET website_url = $2, website_domain = $3, website_status = 'UNVERIFIED', manual_problems = NULL,
             field_sources = field_sources || $4::jsonb, updated_at = now() WHERE id = $1`, [id, parsed.toString(), ownDomain(parsed.toString()), src])
  await logActivity(id, 'website_added', `Website added manually: ${parsed.toString()}`)
  const r = await auditBusinessNow(id)
  return json({ ok: true, website_url: parsed.toString(), ...r })
})
