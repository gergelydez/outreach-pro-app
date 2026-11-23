import { route, json, str } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { poolWhere, NO_SITE_STATUSES } from '@/lib/crm/hunt'
import { areaPlan } from '@/lib/crm/area-hunt'
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
  if (show === 'search') {
    const raw = (str(sp.get('q'), 80) || '').trim()
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[șş]/g, 's').replace(/[țţ]/g, 't')
    const digits = raw.replace(/\D/g, '').replace(/^(00)?(44|36|40)(?=\d{8,})/, '').replace(/^0+/, '')
    where.push(`b.country = '${country}'`)
    const or: string[] = []
    if (raw.length >= 2) { P.push(`%${fold(raw)}%`); or.push(`translate(lower(b.name), 'ăâîșşțţáéíóöőúüűàèìòùäëçñ', 'aaissttaeiooouuuaeiouaecn') LIKE $${P.length}`) }
    if (digits.length >= 4) { P.push(`%${digits}%`); or.push(`regexp_replace(coalesce(b.phone_e164, '') || ' ' || coalesce(b.phone, ''), '[^0-9]', '', 'g') LIKE $${P.length}`) }
    where.push(or.length ? `(${or.join(' OR ')})` : 'false')
  }
  else if (show === 'pool') where.push(poolWhere(country))
  // firmele fără site dintr-o zonă (județ / oraș), încă necontactate
  else if (show === 'area') {
    const plan = areaPlan(country, str(sp.get('region'), 80) || '', str(sp.get('city'), 80), category || 'all')
    P.push(plan.cities.map(c => c.city)); where.push(`b.country = '${country}' AND b.city = ANY($${P.length}::text[])`)
    if (category && category !== 'all') { P.push(category); where.push(`b.category = $${P.length}`) }
    where.push(`b.website_status = ANY('{${NO_SITE_STATUSES.join(',')}}'::text[]) AND b.stage IN ('new_lead','reviewed','ready_to_contact') AND NOT (b.whatsapp_status = 'NOT_FOUND' AND coalesce(b.whatsapp_source, '') = 'manual')`)
  }
  // contactați / interesați: toată țara, ultimii contactați primii
  else if (show === 'followup') where.push(`b.country = '${country}' AND b.stage IN ('contacted','follow_up_1','follow_up_2','replied','interested','call_meeting','proposal_sent','negotiation','won')`)
  // de revenit: contactați care n-au răspuns încă
  else if (show === 'waiting') where.push(`b.country = '${country}' AND b.stage IN ('contacted','follow_up_1','follow_up_2')`)
  else if (show === 'interested') where.push(`b.country = '${country}' AND b.stage IN ('replied','interested','call_meeting','proposal_sent','negotiation')`)
  else if (show === 'won') where.push(`b.country = '${country}' AND b.stage = 'won'`)
  else {
    where.push(`b.country = '${country}'`)
    if (city) { P.push(city); where.push(`b.city = $${P.length}`) }
    if (category) { P.push(category); where.push(`b.category = $${P.length}`) }
    if (show === 'todo') where.push(`b.stage IN ('new_lead','reviewed','ready_to_contact') AND b.website_status <> 'GOOD_WEBSITE'`)
  }
  const rows = await q(`
    SELECT b.id, b.name, b.category, b.city, b.address, b.phone, b.phone_e164, b.email, b.website_url, b.website_status,
           b.whatsapp_status, b.whatsapp_source, b.google_rating, b.google_review_count, b.google_maps_url,
           b.opportunity_score, b.stage, b.last_contacted_at, b.created_at, b.preview_url, b.google_place_id, b.address AS full_address, b.country, b.manual_problems, b.demo_status, b.demo_error, b.demo_started_at, b.demo_style, b.next_follow_up_at, b.last_contacted_at AS contacted_at,
           a.findings, a.created_at AS audited_at,
           m.output AS message
      FROM businesses b
      LEFT JOIN LATERAL (SELECT findings, created_at FROM website_audits w WHERE w.business_id = b.id ORDER BY created_at DESC LIMIT 1) a ON true
      LEFT JOIN LATERAL (SELECT output FROM ai_analyses x WHERE x.business_id = b.id AND x.kind = 'quick' ORDER BY created_at DESC LIMIT 1) m ON true
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${show === 'search' ? `b.last_contacted_at DESC NULLS LAST, ` : ''}${show === 'waiting' ? `(b.next_follow_up_at IS NOT NULL AND b.next_follow_up_at <= now()) DESC, b.last_contacted_at ASC NULLS LAST, ` : ''}${show === 'followup' ? `(b.stage = 'interested') DESC, b.last_contacted_at DESC NULLS LAST, ` : ''}${show === 'pool' ? `(b.whatsapp_source = 'manual' AND b.whatsapp_status = 'FOUND') DESC NULLS LAST, ` : ''}b.opportunity_score DESC NULLS LAST, b.google_review_count DESC NULLS LAST
     LIMIT ${show === 'area' ? 500 : 150}`, P)
  const pending = await one<{ n: string }>(`SELECT count(*)::text AS n FROM audit_jobs WHERE status IN ('pending','running') AND run_after <= now()`)
  return json({ rows, pendingAudits: Number(pending?.n || 0) })
})
