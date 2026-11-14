// Business Hunter: caută afaceri noi printr-un furnizor (Google Places), elimină
// duplicatele, salvează doar lead-uri noi și pune în coadă auditul site-ului.
import { q, one } from './db'
import { getSettings } from './settings'
import { findDuplicate, insertDiscovered, isSuppressed, ownDomain } from './businesses'
import { normalizeUkPhone } from './normalize'
import { enqueueJob } from './jobs'
import { logActivity, logUsage } from './activity'
import { searchText, placesCostPerRequest, ProviderError, type DiscoveredBusiness } from './providers/google-places'
import { UK_CATEGORIES } from './constants'

export interface DiscoveryRequest {
  city: string
  region?: string | null
  category: string
  limit: number                 // câte lead-uri NOI vrem din această rulare
  minRating?: number | null
  minReviews?: number | null
  websiteFilter?: 'any' | 'no_website' | 'has_website'
}

export interface DiscoveryResult {
  jobId: string
  found: number
  newCount: number
  duplicates: number
  filtered: number
  newIds: string[]
  stoppedReason: 'limit_reached' | 'no_more_results' | 'daily_limit' | 'error'
  error?: string
}

export async function newLeadsToday(): Promise<number> {
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM businesses WHERE created_at >= date_trunc('day', now())`)
  return Number(r?.n || 0)
}

export function buildQuery(category: string, city: string, region?: string | null): { textQuery: string; includedType?: string } {
  const cat = UK_CATEGORIES.find(c => c.key === category)
  const what = cat?.query || category.replace(/_/g, ' ')
  return { textQuery: `${what} in ${city}${region ? `, ${region}` : ''}, UK`, includedType: cat?.placesType }
}

function passesFilters(b: DiscoveredBusiness, r: DiscoveryRequest): boolean {
  if (b.businessStatus && b.businessStatus !== 'OPERATIONAL') return false
  if (r.minRating && (b.rating == null || b.rating < r.minRating)) return false
  if (r.minReviews && (b.reviewCount == null || b.reviewCount < r.minReviews)) return false
  if (r.websiteFilter === 'no_website' && b.websiteUrl) return false
  if (r.websiteFilter === 'has_website' && !b.websiteUrl) return false
  return true
}

export async function runDiscovery(r: DiscoveryRequest, fetchImpl?: typeof fetch): Promise<DiscoveryResult> {
  const settings = await getSettings()
  const already = await newLeadsToday()
  const remainingToday = Math.max(0, settings.limits.daily_discovery_max - already)
  const want = Math.max(1, Math.min(r.limit, settings.limits.max_per_run, remainingToday || 0))
  const { textQuery, includedType } = buildQuery(r.category, r.city, r.region)

  const job = await one<{ id: string }>(
    `INSERT INTO discovery_jobs (city, region, category, query, requested, filters) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [r.city, r.region ?? null, r.category, textQuery, r.limit, JSON.stringify({ minRating: r.minRating, minReviews: r.minReviews, websiteFilter: r.websiteFilter })])
  const jobId = job!.id
  const res: DiscoveryResult = { jobId, found: 0, newCount: 0, duplicates: 0, filtered: 0, newIds: [], stoppedReason: 'no_more_results' }

  if (remainingToday <= 0) {
    res.stoppedReason = 'daily_limit'
    await finishJob(res, 'done')
    return res
  }

  let pageToken: string | null = null
  let useType: string | undefined = includedType
  try {
    // Places (New) dă max. 3 pagini × 20 rezultate pentru o interogare
    for (let page = 0; page < 3; page++) {
      let data
      try {
        data = await searchText({ textQuery, includedType: useType, pageToken, fetchImpl })
      } catch (e) {
        // unele tipuri nu sunt acceptate ca includedType: reîncercăm doar cu textul
        if (e instanceof ProviderError && e.status === 400 && useType && page === 0) { useType = undefined; data = await searchText({ textQuery, pageToken, fetchImpl }) }
        else throw e
      }
      await logUsage({ provider: 'google_places', operation: 'searchText', costUsd: placesCostPerRequest() })
      res.found += data.results.length
      for (const b of data.results) {
        if (!passesFilters(b, r)) { res.filtered++; continue }
        // afacerile șterse la cerere / excluse nu se mai importă
        if (await isSuppressed({ google_place_id: b.providerId, website_domain: ownDomain(b.websiteUrl), phone_e164: normalizeUkPhone(b.phoneIntl || b.phone) })) { res.filtered++; continue }
        const dup = await findDuplicate({ placeId: b.providerId, websiteUrl: b.websiteUrl, phone: b.phoneIntl || b.phone, name: b.name, address: b.address })
        if (dup.kind === 'duplicate') {
          res.duplicates++
          // reîmprospătăm datele Google (rating/recenzii) pentru lead-ul existent
          await q(`UPDATE businesses SET google_rating = $2, google_review_count = $3, google_data_fetched_at = now(), updated_at = now() WHERE id = $1`, [dup.id, b.rating, b.reviewCount])
          continue
        }
        const id = await insertDiscovered(b, { city: r.city, region: r.region ?? null, category: r.category, jobId, possibleDuplicateOf: dup.kind === 'possible' ? dup.id : null })
        await enqueueJob('audit', id, {}, { key: `audit:${id}:initial` })
        res.newIds.push(id)
        res.newCount++
        if (res.newCount >= want) { res.stoppedReason = res.newCount >= r.limit ? 'limit_reached' : 'daily_limit'; break }
      }
      if (res.newCount >= want || !data.nextPageToken) break
      pageToken = data.nextPageToken
    }
    await finishJob(res, 'done')
    await logActivity(null, 'discovery', `Discovered ${res.newCount} new ${r.category.replace(/_/g, ' ')} in ${r.city} (${res.duplicates} duplicates skipped)`, { jobId })
  } catch (e) {
    res.stoppedReason = 'error'
    res.error = e instanceof Error ? e.message : String(e)
    await logUsage({ provider: 'google_places', operation: 'searchText', ok: false, error: res.error, costUsd: 0 })
    await finishJob(res, 'failed')
  }
  return res
}

async function finishJob(r: DiscoveryResult, status: string) {
  await q(`UPDATE discovery_jobs SET status = $2, found = $3, new_count = $4, duplicates = $5, filtered = $6, error = $7, finished_at = now() WHERE id = $1`,
    [r.jobId, status, r.found, r.newCount, r.duplicates, r.filtered, r.error ?? null])
}
