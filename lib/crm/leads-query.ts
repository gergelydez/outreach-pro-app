// Filtre + sortare pentru lista de lead-uri, construite cu parametri ($n) — fără
// concatenare de valori în SQL. Folosit de tabel și de exportul CSV.

const SORTS: Record<string, string> = {
  score: 'opportunity_score DESC NULLS LAST, created_at DESC',
  newest: 'created_at DESC',
  name: 'lower(name) ASC',
  rating: 'google_rating DESC NULLS LAST',
  reviews: 'google_review_count DESC NULLS LAST',
  follow_up: 'next_follow_up_at ASC NULLS LAST',
  last_contact: 'last_contacted_at DESC NULLS LAST',
}

export function buildLeadFilter(sp: URLSearchParams): { where: string; params: unknown[]; order: string } {
  const cond: string[] = []
  const params: unknown[] = []
  const p = (v: unknown) => { params.push(v); return `$${params.length}` }
  const list = (k: string) => (sp.get(k) || '').split(',').map(s => s.trim()).filter(Boolean)

  const search = sp.get('q')?.trim()
  if (search) { const v = p(`%${search.toLowerCase()}%`); cond.push(`(lower(name) LIKE ${v} OR lower(coalesce(address,'')) LIKE ${v} OR coalesce(phone,'') LIKE ${v} OR lower(coalesce(email,'')) LIKE ${v})`) }
  if (list('city').length) cond.push(`city = ANY(${p(list('city'))})`)
  if (list('category').length) cond.push(`category = ANY(${p(list('category'))})`)
  if (list('website_status').length) cond.push(`website_status = ANY(${p(list('website_status'))})`)
  if (list('whatsapp').length) cond.push(`whatsapp_status = ANY(${p(list('whatsapp'))})`)
  if (list('stage').length) cond.push(`stage = ANY(${p(list('stage'))})`)
  if (list('tag').length) cond.push(`tags && ${p(list('tag'))}::text[]`)
  const num = (k: string) => { const n = Number(sp.get(k)); return sp.get(k) != null && sp.get(k) !== '' && Number.isFinite(n) ? n : null }
  const minScore = num('min_score'); if (minScore != null) cond.push(`opportunity_score >= ${p(minScore)}`)
  const maxScore = num('max_score'); if (maxScore != null) cond.push(`opportunity_score <= ${p(maxScore)}`)
  const minRating = num('min_rating'); if (minRating != null) cond.push(`google_rating >= ${p(minRating)}`)
  const minReviews = num('min_reviews'); if (minReviews != null) cond.push(`google_review_count >= ${p(minReviews)}`)
  const from = sp.get('from'); if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) cond.push(`created_at >= ${p(from)}::date`)
  const to = sp.get('to'); if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) cond.push(`created_at < (${p(to)}::date + interval '1 day')`)
  const contacted = sp.get('contacted')
  if (contacted === 'yes') cond.push('last_contacted_at IS NOT NULL')
  if (contacted === 'no') cond.push('last_contacted_at IS NULL')
  if (sp.get('duplicates') === 'possible') cond.push('possible_duplicate_of IS NOT NULL')

  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params, order: SORTS[sp.get('sort') || 'score'] || SORTS.score }
}

export const LEAD_COLUMNS = `id, name, category, city, region, address, postcode, phone, phone_e164, email, website_url, website_domain, website_status,
  whatsapp_status, whatsapp_url, google_rating, google_review_count, google_maps_url, opportunity_score, opportunity_label, stage, deal_value,
  last_contacted_at, next_follow_up_at, lead_source, tags, possible_duplicate_of, subscriber_type, created_at`
