// Operații pe lead-uri: deduplicare, inserare cu proveniență, aplicarea auditului,
// recalcularea scorului, schimbarea etapei.
import { q, one, db, type Queryable } from './db'
import { normalizeDomain, normalizeName, extractUkPostcode } from './normalize'
import { normalizePhone, asCountry, type Country } from './countries'
import { classifyWebsite } from './classify'
import { scoreLead } from './scoring'
import { getSettings } from './settings'
import { logActivity } from './activity'
import { enqueueJob } from './jobs'
import type { AuditFacts } from './audit-types'
import type { DiscoveredBusiness } from './providers/google-places'
import { STAGE_KEYS, stageLabel } from './constants'

export interface BusinessRow {
  id: string; name: string; category: string | null; city: string | null; region: string | null; address: string | null; postcode: string | null
  phone: string | null; phone_e164: string | null; email: string | null; website_url: string | null; website_domain: string | null
  google_place_id: string | null; google_maps_url: string | null; google_rating: string | null; google_review_count: number | null
  website_status: string; whatsapp_status: string; whatsapp_url: string | null; opportunity_score: number | null; opportunity_label: string | null
  stage: string; deal_value: string | null; next_follow_up_at: string | null; last_contacted_at: string | null; subscriber_type: string
  lawful_basis: string | null; tags: string[]; possible_duplicate_of: string | null; field_sources: Record<string, unknown>; created_at: string
}

export type DedupeResult =
  | { kind: 'duplicate'; id: string; matchedOn: 'place_id' | 'domain' | 'phone' }
  | { kind: 'possible'; id: string; matchedOn: 'name_postcode' }
  | { kind: 'new' }

// Potriviri sigure (Place ID, domeniu propriu, telefon) = duplicat. Numele + codul
// poștal e doar o potrivire slabă: lead-ul se salvează, dar e marcat pentru verificare.
export async function findDuplicate(b: { placeId?: string | null; websiteUrl?: string | null; phone?: string | null; name: string; address?: string | null; country?: Country }, on: Queryable = db()): Promise<DedupeResult> {
  if (b.placeId) {
    const r = await one<{ id: string }>('SELECT id FROM businesses WHERE google_place_id = $1', [b.placeId], on)
    if (r) return { kind: 'duplicate', id: r.id, matchedOn: 'place_id' }
  }
  const domain = ownDomain(b.websiteUrl)
  if (domain) {
    const r = await one<{ id: string }>('SELECT id FROM businesses WHERE website_domain = $1 LIMIT 1', [domain], on)
    if (r) return { kind: 'duplicate', id: r.id, matchedOn: 'domain' }
  }
  const phone = normalizePhone(b.phone, b.country || 'UK')
  if (phone) {
    const r = await one<{ id: string }>('SELECT id FROM businesses WHERE phone_e164 = $1 LIMIT 1', [phone], on)
    if (r) return { kind: 'duplicate', id: r.id, matchedOn: 'phone' }
  }
  const postcode = (b.country || 'UK') === 'UK' ? extractUkPostcode(b.address) : null
  if (postcode) {
    const rows = await q<{ id: string; name: string }>('SELECT id, name FROM businesses WHERE postcode = $1', [postcode], on)
    const n = normalizeName(b.name)
    const hit = rows.find(r => normalizeName(r.name) === n)
    if (hit) return { kind: 'possible', id: hit.id, matchedOn: 'name_postcode' }
  }
  return { kind: 'new' }
}

// Domeniile de social media / directoare nu identifică o afacere (multe au facebook.com)
export function ownDomain(url: string | null | undefined): string | null {
  const d = normalizeDomain(url)
  if (!d) return null
  const shared = ['facebook.com', 'instagram.com', 'linktr.ee', 'checkatrade.com', 'yell.com', 'mybuilder.com', 'trustatrader.com', 'ratedpeople.com', 'google.com', 'business.site', 'wixsite.com', 'sites.google.com']
  return shared.some(s => d === s || d.endsWith('.' + s)) ? null : d
}

const retentionDays = () => Number(process.env.GOOGLE_DATA_RETENTION_DAYS || '30')

export async function insertDiscovered(b: DiscoveredBusiness, ctx: { city: string; region: string | null; category: string; jobId: string; possibleDuplicateOf?: string | null; country?: Country }, on: Queryable = db()): Promise<string> {
  const country = ctx.country || 'UK'
  const now = new Date().toISOString()
  const src = (field: string) => ({ [field]: { source: 'google_places', verified: true, checked_at: now } })
  const sources = { ...src('name'), ...src('address'), ...src('phone'), ...src('website_url'), ...src('google_rating'), ...src('google_review_count') }
  const row = await one<{ id: string }>(
    `INSERT INTO businesses (name, category, city, region, address, postcode, phone, phone_e164, website_url, website_domain,
       google_place_id, google_maps_url, google_rating, google_review_count, google_data_fetched_at, business_status,
       website_status, lead_source, field_sources, discovery_job_id, possible_duplicate_of, country)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15,'UNVERIFIED','google_places',$16,$17,$18,$19)
     RETURNING id`,
    [b.name, ctx.category, ctx.city, ctx.region, b.address, country === 'UK' ? extractUkPostcode(b.address) : null, b.phone || b.phoneIntl, normalizePhone(b.phoneIntl || b.phone, country),
      b.websiteUrl, ownDomain(b.websiteUrl), b.providerId, b.mapsUrl, b.rating, b.reviewCount, b.businessStatus,
      JSON.stringify(sources), ctx.jobId, ctx.possibleDuplicateOf ?? null, country], on)
  const id = row!.id
  await q(`INSERT INTO business_sources (business_id, provider, provider_id, payload, expires_at)
           VALUES ($1, 'google_places', $2, $3, now() + ($4 || ' days')::interval)`, [id, b.providerId, JSON.stringify(b.raw), String(retentionDays())], on)
  await q(`INSERT INTO pipeline_events (business_id, from_stage, to_stage, changed_by) VALUES ($1, NULL, 'new_lead', 'system')`, [id], on)
  return id
}

// Aplică rezultatul auditului primit de la worker: clasificare, constatări, WhatsApp,
// contacte găsite pe site (cu proveniență), scor, și recheck dacă e un eșec temporar.
export async function applyAudit(businessId: string, facts: AuditFacts): Promise<{ status: string; score: number }> {
  const b = await one<BusinessRow>('SELECT * FROM businesses WHERE id = $1', [businessId])
  if (!b) throw new Error('Business not found')

  // Site găsit pe un domeniu probabil (afacere fără URL în profil): îl salvăm și auditam din nou
  if (!b.website_url && facts.presence?.found_url) {
    const sources = { ...b.field_sources, website_url: { source: 'domain_check', verified: true, checked_at: new Date().toISOString() } }
    await q('UPDATE businesses SET website_url = $2, website_domain = $3, field_sources = $4, updated_at = now() WHERE id = $1',
      [businessId, facts.presence.found_url, ownDomain(facts.presence.found_url), JSON.stringify(sources)])
    await logActivity(businessId, 'website_found', `Website found on a likely domain: ${facts.presence.found_url}`)
    await enqueueJob('audit', businessId, {}, { key: `audit:${businessId}:found:${Date.now()}` })
    return { status: 'UNVERIFIED', score: b.opportunity_score ?? 0 }
  }

  const prevFail = await one<{ created_at: string }>(
    `SELECT created_at FROM website_audits WHERE business_id = $1 AND reachable = false AND url = $2 ORDER BY created_at ASC LIMIT 1`, [businessId, b.website_url])
  const cls = classifyWebsite({ websiteUrl: b.website_url, facts, previousFailureAt: prevFail ? new Date(prevFail.created_at) : null, city: b.city })

  await q(`INSERT INTO website_audits (business_id, url, final_url, reachable, website_status, facts, findings, pagespeed, content_hash, error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [businessId, b.website_url, facts.final_url ?? null, facts.reachable, cls.status, JSON.stringify(facts), JSON.stringify(cls.findings),
      facts.pagespeed ? JSON.stringify(facts.pagespeed) : null, facts.content_hash ?? null, facts.reachable ? null : (facts.error_kind || `HTTP ${facts.http_status}`)])

  // WhatsApp: FOUND doar cu link public; NOT_FOUND = nimic detectat pe pagină (nu înseamnă că nu are)
  const waLinks = facts.whatsapp_links || []
  const audited = facts.reachable && !!b.website_url
  const manualWa = (b as { whatsapp_source?: string | null }).whatsapp_source === 'manual'
  const waStatus = manualWa ? b.whatsapp_status : waLinks.length || facts.whatsapp_widget ? 'FOUND' : audited ? 'NOT_FOUND' : b.whatsapp_status
  const sources: Record<string, unknown> = { ...b.field_sources }
  const updates: Record<string, unknown> = {}
  if (!b.email && facts.emails?.length) { updates.email = facts.emails[0]; sources.email = { source: 'website', verified: true, checked_at: new Date().toISOString(), url: facts.final_url } }
  if (!b.phone && facts.phones?.length) { updates.phone = facts.phones[0]; updates.phone_e164 = normalizePhone(facts.phones[0], asCountry((b as { country?: string }).country)); sources.phone = { source: 'website', verified: true, checked_at: new Date().toISOString() } }

  const settings = await getSettings()
  const score = scoreLead({ websiteStatus: cls.status, facts, rating: b.google_rating != null ? Number(b.google_rating) : null, reviewCount: b.google_review_count, weights: settings.scoring })
  await q(`INSERT INTO lead_scores (business_id, score, label, factors, weights) VALUES ($1,$2,$3,$4,$5)`,
    [businessId, score.score, score.label, JSON.stringify(score.factors), JSON.stringify(settings.scoring)])

  await q(`UPDATE businesses SET website_status = $2, whatsapp_status = $3, whatsapp_url = $4, whatsapp_source = $5,
             whatsapp_checked_at = CASE WHEN $6 THEN now() ELSE whatsapp_checked_at END,
             opportunity_score = $7, opportunity_label = $8, field_sources = $9,
             email = COALESCE($10, email), phone = COALESCE($11, phone), phone_e164 = COALESCE($12, phone_e164), updated_at = now()
           WHERE id = $1`,
    [businessId, cls.status, waStatus, manualWa ? (b as { whatsapp_url?: string | null }).whatsapp_url ?? null : waLinks[0] || null, manualWa ? 'manual' : waLinks.length || facts.whatsapp_widget ? (facts.final_url || b.website_url) : null, audited && !manualWa,
      score.score, score.label, JSON.stringify(sources), updates.email ?? null, updates.phone ?? null, updates.phone_e164 ?? null])

  await logActivity(businessId, 'audit_completed', `Website audit: ${cls.status.replace(/_/g, ' ').toLowerCase()} · score ${score.score}`, { status: cls.status, findings: cls.findings.length })
  if (cls.needsRecheck) await enqueueJob('audit', businessId, { recheck: true }, { key: `audit:${businessId}:recheck:${new Date().toISOString().slice(0, 10)}`, runAfter: new Date(Date.now() + 6.5 * 3600_000) })
  return { status: cls.status, score: score.score }
}

// Recalcul scor pentru toți (după schimbarea ponderilor), din ultimul audit salvat
export async function rescoreAll(): Promise<number> {
  const settings = await getSettings()
  const rows = await q<{ id: string; website_status: string; google_rating: string | null; google_review_count: number | null; facts: AuditFacts | null }>(
    `SELECT b.id, b.website_status, b.google_rating, b.google_review_count,
            (SELECT facts FROM website_audits a WHERE a.business_id = b.id ORDER BY created_at DESC LIMIT 1) AS facts
     FROM businesses b`)
  for (const r of rows) {
    const s = scoreLead({ websiteStatus: r.website_status, facts: r.facts, rating: r.google_rating != null ? Number(r.google_rating) : null, reviewCount: r.google_review_count, weights: settings.scoring })
    await q('UPDATE businesses SET opportunity_score = $2, opportunity_label = $3 WHERE id = $1', [r.id, s.score, s.label])
    await q('INSERT INTO lead_scores (business_id, score, label, factors, weights) VALUES ($1,$2,$3,$4,$5)', [r.id, s.score, s.label, JSON.stringify(s.factors), JSON.stringify(settings.scoring)])
  }
  return rows.length
}

export async function changeStage(businessId: string, toStage: string, changedBy = 'owner'): Promise<void> {
  if (!STAGE_KEYS.includes(toStage)) throw new Error('Invalid stage')
  await db().transaction(async tx => {
    const cur = await one<{ stage: string }>('SELECT stage FROM businesses WHERE id = $1 FOR UPDATE', [businessId], tx)
    if (!cur) throw new Error('Business not found')
    if (cur.stage === toStage) return
    await q('UPDATE businesses SET stage = $2, stage_changed_at = now(), updated_at = now() WHERE id = $1', [businessId, toStage], tx)
    await q('INSERT INTO pipeline_events (business_id, from_stage, to_stage, changed_by) VALUES ($1,$2,$3,$4)', [businessId, cur.stage, toStage, changedBy], tx)
    await logActivity(businessId, 'stage_changed', `Stage: ${stageLabel(cur.stage)} → ${stageLabel(toStage)}`, { from: cur.stage, to: toStage }, tx)
  })
}

export async function isSuppressed(b: Partial<Pick<BusinessRow, 'id' | 'email' | 'phone_e164' | 'website_domain' | 'google_place_id'>>, on: Queryable = db()): Promise<boolean> {
  const r = await one(`SELECT 1 FROM suppression_list WHERE (kind = 'business' AND value = $1) OR (kind = 'email' AND value = lower($2))
                       OR (kind = 'phone' AND value = $3) OR (kind = 'domain' AND value = $4) OR (kind = 'place' AND value = $5) LIMIT 1`,
    [b.id || '', b.email || '', b.phone_e164 || '', b.website_domain || '', b.google_place_id || ''], on)
  return !!r
}

// Retenție: datele venite doar de la Google expiră după GOOGLE_DATA_RETENTION_DAYS (implicit 30).
// Păstrăm Place ID (permis permanent) și numele (identificarea lead-ului); restul câmpurilor
// care au ca sursă unică Google sunt golite până la o reîmprospătare.
export async function purgeExpiredProviderData(): Promise<{ sources: number; businesses: number }> {
  const s = await q(`DELETE FROM business_sources WHERE expires_at IS NOT NULL AND expires_at < now() RETURNING id`)
  const b = await q(
    `UPDATE businesses SET
       google_rating = NULL, google_review_count = NULL,
       address = CASE WHEN field_sources->'address'->>'source' = 'google_places' THEN NULL ELSE address END,
       phone = CASE WHEN field_sources->'phone'->>'source' = 'google_places' THEN NULL ELSE phone END,
       updated_at = now()
     WHERE google_data_fetched_at < now() - ($1 || ' days')::interval AND google_rating IS NOT NULL
     RETURNING id`, [String(retentionDays())])
  return { sources: s.length, businesses: b.length }
}
