// Furnizor de descoperire: Google Places API (varianta clasică) — aceeași pe care o folosesc deja
// uneltele pentru România și Ungaria, deci aceeași cheie GOOGLE_PLACES_API_KEY, fără nimic de activat.
//   1) Text Search  → firmele (nume, adresă, rating, recenzii, status) — 20 pe pagină, max. 3 pagini
//   2) Place Details → telefon, site, link Google Maps — doar pentru firmele noi care trec de filtre
// API oficial; nu se face scraping pe Google Maps.
// Documentație: https://developers.google.com/maps/documentation/places/web-service/legacy/search-text

export interface DiscoveredBusiness {
  provider: 'google_places'
  providerId: string
  name: string
  address: string | null
  phone: string | null
  phoneIntl: string | null
  websiteUrl: string | null
  rating: number | null
  reviewCount: number | null
  mapsUrl: string | null
  businessStatus: string | null
  primaryType: string | null
  raw: Record<string, unknown>
}

export interface SearchPage { results: DiscoveredBusiness[]; nextPageToken: string | null }

const API = 'https://maps.googleapis.com/maps/api/place'

export class ProviderError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) { super(message) }
}

// Cheia: din Vercel (GOOGLE_PLACES_API_KEY) sau, ca la uneltele pentru România/Ungaria,
// cea salvată în pagina Setări a aplicației (trimisă de browser la fiecare căutare).
export function placesKey(override?: string | null): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || (override && override.trim()) || null
}

// Cost estimativ (USD) pentru urmărirea bugetului; verifică prețurile curente în Google Cloud.
export const textSearchCost = () => Number(process.env.GOOGLE_TEXTSEARCH_COST || '0.032')
export const detailsCost = () => Number(process.env.GOOGLE_DETAILS_COST || '0.020')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// API-ul clasic răspunde mereu HTTP 200; eroarea e în câmpul "status"
function checkStatus(data: { status?: string; error_message?: string }, httpStatus: number) {
  const s = data.status || (httpStatus === 200 ? 'UNKNOWN_ERROR' : `HTTP_${httpStatus}`)
  if (s === 'OK' || s === 'ZERO_RESULTS') return
  const msg = `Google Places: ${s}${data.error_message ? ` — ${data.error_message}` : ''}`
  if (s === 'REQUEST_DENIED') throw new ProviderError(`${msg}. Check that GOOGLE_PLACES_API_KEY has "Places API" enabled.`, 403, false)
  if (s === 'OVER_QUERY_LIMIT' || s === 'OVER_DAILY_LIMIT') throw new ProviderError(msg, 429, true)
  if (s === 'INVALID_REQUEST') throw new ProviderError(msg, 400, false)
  throw new ProviderError(msg, 502, true)
}

export async function searchText(opts: { textQuery: string; pageToken?: string | null; fetchImpl?: typeof fetch; pageDelayMs?: number; apiKey?: string | null; region?: string; language?: string }): Promise<SearchPage> {
  const key = placesKey(opts.apiKey)
  if (!key) throw new ProviderError('No Google Places key: add it in the app Settings page or as GOOGLE_PLACES_API_KEY in Vercel', 503, false)
  const u = new URL(`${API}/textsearch/json`)
  if (opts.pageToken) u.searchParams.set('pagetoken', opts.pageToken)
  else { u.searchParams.set('query', opts.textQuery); u.searchParams.set('region', opts.region || 'uk'); u.searchParams.set('language', opts.language || 'en-GB') }
  u.searchParams.set('key', key)

  // Tokenul paginii următoare devine valid după ~2 secunde; dacă nu e gata, Google dă INVALID_REQUEST.
  // Google trimite uneori un token chiar dacă nu mai are rezultate: dacă după reîncercări tot
  // INVALID_REQUEST e, înseamnă „nu mai sunt pagini” — nu o eroare (prima pagină e deja salvată).
  const attempts = opts.pageToken ? 3 : 1
  let data: { status?: string; error_message?: string; results?: Record<string, any>[]; next_page_token?: string } = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < attempts; i++) {
    if (opts.pageToken) await sleep((opts.pageDelayMs ?? 2000) * (i === 0 ? 1 : 1.5))
    const res = await (opts.fetchImpl || fetch)(u.toString(), { signal: AbortSignal.timeout(15000) })
    data = await res.json().catch(() => ({}))
    if (opts.pageToken && data.status === 'INVALID_REQUEST') {
      if (i < attempts - 1) continue
      return { results: [], nextPageToken: null }
    }
    checkStatus(data, res.status)
    break
  }
  return {
    nextPageToken: data.next_page_token || null,
    results: (data.results || []).map(p => ({
      provider: 'google_places' as const,
      providerId: String(p.place_id || ''),
      name: p.name || '',
      address: p.formatted_address || null,
      phone: null, phoneIntl: null, websiteUrl: null, mapsUrl: null, // vin din Place Details
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviewCount: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : null,
      businessStatus: p.business_status || null,
      primaryType: Array.isArray(p.types) ? p.types[0] ?? null : null,
      raw: p,
    })).filter(b => b.providerId && b.name),
  }
}

// Completează telefonul, site-ul și link-ul Google Maps (doar câmpurile necesare)
export async function placeDetails(b: DiscoveredBusiness, fetchImpl?: typeof fetch, apiKey?: string | null, language = 'en-GB'): Promise<DiscoveredBusiness> {
  const key = placesKey(apiKey)
  if (!key) throw new ProviderError('GOOGLE_PLACES_API_KEY is not configured', 503, false)
  const u = new URL(`${API}/details/json`)
  u.searchParams.set('place_id', b.providerId)
  u.searchParams.set('fields', 'formatted_phone_number,international_phone_number,website,url,business_status')
  u.searchParams.set('language', language)
  u.searchParams.set('key', key)
  const res = await (fetchImpl || fetch)(u.toString(), { signal: AbortSignal.timeout(15000) })
  const data = await res.json().catch(() => ({})) as { status?: string; error_message?: string; result?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
  checkStatus(data, res.status)
  const d = data.result || {}
  return {
    ...b,
    phone: d.formatted_phone_number || null,
    phoneIntl: d.international_phone_number || null,
    websiteUrl: d.website || null,
    mapsUrl: d.url || `https://www.google.com/maps/place/?q=place_id:${b.providerId}`,
    businessStatus: d.business_status || b.businessStatus,
    raw: { ...b.raw, details: d },
  }
}

// ── Places API (New) — Text Search cu telefon + site în același apel (fără Place Details) ──
// ~10x mai ieftin pentru același rezultat. Dacă API-ul nou nu e activat la cheie, discovery
// trece automat pe varianta clasică de mai sus.
const NEW_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.businessStatus',
  'places.primaryType', 'nextPageToken',
].join(',')

export const newSearchCost = () => Number(process.env.GOOGLE_PLACES_NEW_COST || '0.040')

export class ApiNotEnabled extends Error {}

export async function searchTextNew(opts: { textQuery: string; pageToken?: string | null; fetchImpl?: typeof fetch; apiKey?: string | null; regionCode?: string; languageCode?: string }): Promise<SearchPage> {
  const key = placesKey(opts.apiKey)
  if (!key) throw new ProviderError('No Google Places key: add it in the app Settings page or as GOOGLE_PLACES_API_KEY in Vercel', 503, false)
  const body: Record<string, unknown> = { textQuery: opts.textQuery, regionCode: opts.regionCode || 'GB', languageCode: opts.languageCode || 'en-GB', pageSize: 20 }
  if (opts.pageToken) body.pageToken = opts.pageToken
  const res = await (opts.fetchImpl || fetch)('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': NEW_FIELD_MASK },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({})) as { places?: Record<string, any>[]; nextPageToken?: string; error?: { message?: string; status?: string } } // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!res.ok) {
    const msg = data.error?.message || data.error?.status || 'request failed'
    // API-ul nou nu e activat / cheia e restricționată doar la cel vechi → folosim varianta clasică
    if (res.status === 403 || /not been used|disabled|not enabled|not authorized|API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED/i.test(msg)) throw new ApiNotEnabled(msg)
    throw new ProviderError(`Google Places ${res.status}: ${msg}`, res.status, res.status === 429 || res.status >= 500)
  }
  return {
    nextPageToken: data.nextPageToken || null,
    results: (data.places || []).map(p => ({
      provider: 'google_places' as const,
      providerId: String(p.id),
      name: p.displayName?.text || '',
      address: p.formattedAddress || null,
      phone: p.nationalPhoneNumber || null,
      phoneIntl: p.internationalPhoneNumber || null,
      websiteUrl: p.websiteUri || null,
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviewCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      mapsUrl: p.googleMapsUri || null,
      businessStatus: p.businessStatus || null,
      primaryType: p.primaryType || null,
      raw: p,
    })).filter(b => b.providerId && b.name),
  }
}
