// Furnizor de descoperire: Google Places API (New) — Text Search.
// API oficial, cu field mask minimal. Nu se face scraping pe Google Maps.
// Documentație: https://developers.google.com/maps/documentation/places/web-service/text-search

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

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.businessStatus',
  'places.primaryType', 'nextPageToken',
].join(',')

export class ProviderError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) { super(message) }
}

export function placesKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null
}

// Cost estimativ per cerere (Text Search cu câmpuri de contact/rating = SKU Enterprise).
// Verifică prețul curent în consola Google Cloud și ajustează GOOGLE_PLACES_COST_PER_REQUEST.
export const placesCostPerRequest = () => Number(process.env.GOOGLE_PLACES_COST_PER_REQUEST || '0.035')

export async function searchText(opts: { textQuery: string; includedType?: string; pageToken?: string | null; fetchImpl?: typeof fetch }): Promise<SearchPage> {
  const key = placesKey()
  if (!key) throw new ProviderError('GOOGLE_PLACES_API_KEY is not configured', 503, false)
  const body: Record<string, unknown> = { textQuery: opts.textQuery, regionCode: 'GB', languageCode: 'en-GB', pageSize: 20 }
  if (opts.includedType) body.includedType = opts.includedType
  if (opts.pageToken) body.pageToken = opts.pageToken
  const res = await (opts.fetchImpl || fetch)('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({})) as { places?: Record<string, any>[]; nextPageToken?: string; error?: { message?: string; status?: string } } // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!res.ok) {
    throw new ProviderError(`Google Places ${res.status}: ${data.error?.message || data.error?.status || 'request failed'}`, res.status, res.status === 429 || res.status >= 500)
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
