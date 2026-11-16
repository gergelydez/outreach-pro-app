import { route, json, str } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { poolWhere } from '@/lib/crm/hunt'
import { asCountry } from '@/lib/crm/countries'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Date pentru pagina simplă „Găsește clienți”: firmele cu problemele găsite la audit,
// ultimul mesaj scris de AI și câte audituri mai sunt în așteptare.
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const city = str(sp.get('city'), 80)
  const category = str(sp.get('category'), 60)
  // pool = lista zilei (vânătoarea), todo = necontactate și fără site bun, all = toate
  const show = sp.get('show') || 'todo'
  const country = asCountry(sp.get('country'))
  const where: string[] = []
  const P: unknown[] = []
  if (show === 'pool') where.push(poolWhere(country))
  // contactați / interesați: toată țara, ultimii contactați primii
  else if (show === 'followup') where.push(`b.country = '${country}' AND b.stage IN ('contacted','follow_up_1','follow_up_2','replied','interested','call_meeting','proposal_sent','negotiation','won')`)
  else {
    where.push(`b.country = '${country}'`)
    if (city) { P.push(city); where.push(`b.city = $${P.length}`) }
    if (category) { P.push(category); where.push(`b.category = $${P.length}`) }
    if (show === 'todo') where.push(`b.stage IN ('new_lead','reviewed','ready_to_contact') AND b.website_status <> 'GOOD_WEBSITE'`)
  }
  const rows = await q(`
    SELECT b.id, b.name, b.category, b.city, b.address, b.phone, b.phone_e164, b.email, b.website_url, b.website_status,
           b.whatsapp_status, b.whatsapp_source, b.google_rating, b.google_review_count, b.google_maps_url,
           b.opportunity_score, b.stage, b.last_contacted_at, b.created_at, b.preview_url, b.google_place_id, b.address AS full_address, b.country, b.manual_problems,
           a.findings, a.created_at AS audited_at,
           m.output AS message
      FROM businesses b
      LEFT JOIN LATERAL (SELECT findings, created_at FROM website_audits w WHERE w.business_id = b.id ORDER BY created_at DESC LIMIT 1) a ON true
      LEFT JOIN LATERAL (SELECT output FROM ai_analyses x WHERE x.business_id = b.id AND x.kind = 'quick' ORDER BY created_at DESC LIMIT 1) m ON true
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${show === 'followup' ? `(b.stage = 'interested') DESC, b.last_contacted_at DESC NULLS LAST, ` : ''}${show === 'pool' ? `(b.whatsapp_source = 'manual' AND b.whatsapp_status = 'FOUND') DESC NULLS LAST, ` : ''}b.opportunity_score DESC NULLS LAST, b.google_review_count DESC NULLS LAST
     LIMIT 150`, P)
  const pending = await one<{ n: string }>(`SELECT count(*)::text AS n FROM audit_jobs WHERE status IN ('pending','running') AND run_after <= now()`)
  return json({ rows, pendingAudits: Number(pending?.n || 0) })
})
