// Business Hunter: caută afaceri noi printr-un furnizor (Google Places), elimină
// duplicatele, salvează doar lead-uri noi și pune în coadă auditul site-ului.
import { q, one } from './db'
import { getSettings } from './settings'
import { findDuplicate, insertDiscovered, isSuppressed, ownDomain } from './businesses'
import { normalizeUkPhone, ukPhoneType } from './normalize'
import { enqueueJob } from './jobs'
import { logActivity, logUsage } from './activity'
import { searchText, searchTextNew, placeDetails, textSearchCost, detailsCost, newSearchCost, ApiNotEnabled, type DiscoveredBusiness, type SearchPage } from './providers/google-places'
import { UK_CATEGORIES } from './constants'

export interface DiscoveryRequest {
  city: string
  region?: string | null
  category: string
  limit: number                 // câte lead-uri NOI vrem din această rulare
  minRating?: number | null
  minReviews?: number | null
  websiteFilter?: 'any' | 'no_website' | 'has_website'
  // doar numere de mobil UK (07…), adică firme care pot avea WhatsApp
  mobileOnly?: boolean
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

// Filtre aplicabile direct pe rezultatele Text Search (fără cost suplimentar)
function passesBasicFilters(b: DiscoveredBusiness, r: DiscoveryRequest): boolean {
  if (b.businessStatus && b.businessStatus !== 'OPERATIONAL') return false
  if (r.minRating && (b.rating == null || b.rating < r.minRating)) return false
  if (r.minReviews && (b.reviewCount == null || b.reviewCount < r.minReviews)) return false
  return true
}

// Filtrul de site se poate aplica abia după Place Details
function passesWebsiteFilter(b: DiscoveredBusiness, r: DiscoveryRequest): boolean {
  if (b.businessStatus && b.businessStatus !== 'OPERATIONAL') return false
  if (r.websiteFilter === 'no_website' && b.websiteUrl) return false
  if (r.websiteFilter === 'has_website' && !b.websiteUrl) return false
  return true
}

export async function runDiscovery(r: DiscoveryRequest, fetchImpl?: typeof fetch, opts: { pageDelayMs?: number; apiKey?: string | null } = {}): Promise<DiscoveryResult> {
  const settings = await getSettings()
  const already = await newLeadsToday()
  const remainingToday = Math.max(0, settings.limits.daily_discovery_max - already)
  const want = Math.max(1, Math.min(r.limit, settings.limits.max_per_run, remainingToday || 0))
  const { textQuery } = buildQuery(r.category, r.city, r.region)

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
  const pageDelayMs = opts.pageDelayMs ?? (fetchImpl ? 0 : 2000)
  // API-ul nou (telefon + site într-un singur apel) dacă e activat la cheie; altfel cel clasic
  let mode = await placesMode()
  try {
    // Text Search dă max. 3 pagini × 20 rezultate pentru o interogare
    for (let page = 0; page < 3; page++) {
      let data: SearchPage | null = null
      let usedNew = false
      if (mode !== 'legacy') {
        try {
          data = await searchTextNew({ textQuery, pageToken, fetchImpl, apiKey: opts.apiKey })
          usedNew = true
          await logUsage({ provider: 'google_places', operation: 'textSearchNew', costUsd: newSearchCost() })
          if (mode !== 'new') { mode = 'new'; await setPlacesMode('new') }
        } catch (e) {
          if (!(e instanceof ApiNotEnabled)) throw e
          mode = 'legacy'; await setPlacesMode('legacy')
          if (page > 0) break // tokenul paginii e al API-ului nou; ne oprim la ce avem
        }
      }
      if (!data) {
        data = await searchText({ textQuery, pageToken, fetchImpl, pageDelayMs, apiKey: opts.apiKey })
        await logUsage({ provider: 'google_places', operation: 'textSearch', costUsd: textSearchCost() })
      }
      res.found += data.results.length

      // 1) filtre gratuite + firme deja cunoscute (după place_id) — fără Place Details
      const candidates: DiscoveredBusiness[] = []
      for (const b of data.results) {
        if (!passesBasicFilters(b, r)) { res.filtered++; continue }
        if (await isSuppressed({ google_place_id: b.providerId })) { res.filtered++; continue }
        const known = await one<{ id: string }>('SELECT id FROM businesses WHERE google_place_id = $1', [b.providerId])
        if (known) {
          res.duplicates++
          // reîmprospătăm datele Google (rating/recenzii) pentru lead-ul existent
          await q(`UPDATE businesses SET google_rating = $2, google_review_count = $3, google_data_fetched_at = now(), updated_at = now() WHERE id = $1`, [known.id, b.rating, b.reviewCount])
          continue
        }
        candidates.push(b)
      }

      // 2) API-ul nou a dat deja telefonul și site-ul. Cel clasic cere Place Details, doar pentru cele noi;
      //    fără filtre de site/mobil nu cerem mai multe decât ne trebuie
      let enriched: (DiscoveredBusiness | null)[]
      if (usedNew) enriched = candidates
      else {
        const need = want - res.newCount
        const toEnrich = (r.websiteFilter && r.websiteFilter !== 'any') || r.mobileOnly ? candidates : candidates.slice(0, need)
        res.filtered += candidates.length - toEnrich.length
        enriched = await Promise.all(toEnrich.map(b => placeDetails(b, fetchImpl, opts.apiKey).then(d => d, () => null)))
        const detailCalls = toEnrich.length
        if (detailCalls) await logUsage({ provider: 'google_places', operation: 'placeDetails', units: detailCalls, costUsd: detailCalls * detailsCost() })
      }

      for (const b of enriched) {
        if (!b) { res.filtered++; continue }
        if (!passesWebsiteFilter(b, r)) { res.filtered++; continue }
        if (r.mobileOnly && ukPhoneType(normalizeUkPhone(b.phoneIntl || b.phone)) !== 'mobile') { res.filtered++; continue }
        // afacerile șterse la cerere / excluse nu se mai importă
        if (await isSuppressed({ google_place_id: b.providerId, website_domain: ownDomain(b.websiteUrl), phone_e164: normalizeUkPhone(b.phoneIntl || b.phone) })) { res.filtered++; continue }
        const dup = await findDuplicate({ placeId: b.providerId, websiteUrl: b.websiteUrl, phone: b.phoneIntl || b.phone, name: b.name, address: b.address })
        if (dup.kind === 'duplicate') { res.duplicates++; continue }
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
    await logUsage({ provider: 'google_places', operation: 'textSearch', ok: false, error: res.error, costUsd: 0 })
    await finishJob(res, 'failed')
  }
  return res
}

async function finishJob(r: DiscoveryResult, status: string) {
  await q(`UPDATE discovery_jobs SET status = $2, found = $3, new_count = $4, duplicates = $5, filtered = $6, error = $7, finished_at = now() WHERE id = $1`,
    [r.jobId, status, r.found, r.newCount, r.duplicates, r.filtered, r.error ?? null])
}

// Ce variantă de Google Places folosim: 'auto' (încearcă API-ul nou), 'new' sau 'legacy'
export async function placesMode(): Promise<'auto' | 'new' | 'legacy'> {
  const r = await one<{ value: { mode?: string; at?: string } }>(`SELECT value FROM app_settings WHERE key = 'places_mode'`)
  const m = r?.value?.mode
  // reîncercăm API-ul nou o dată pe oră (poate între timp a fost activat) — o încercare respinsă nu costă
  if (m === 'legacy' && r?.value?.at && Date.now() - new Date(r.value.at).getTime() > 3600_000) return 'auto'
  return m === 'new' || m === 'legacy' ? m : 'auto'
}
async function setPlacesMode(mode: 'new' | 'legacy') {
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ('places_mode', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ mode, at: new Date().toISOString() })])
}
