// Context real despre o afacere, ca redesign-ul să pară site-ul EI, nu un șablon:
// pozele și recenziile ei din Google Maps, plus poze libere ale localității
// (Wikimedia Commons). Doar pe server.
import { createHmac } from 'crypto'

export interface ContextPhoto { url: string; credit: string }
export interface ContextReview { author: string; rating: number; text: string; when: string }
export interface PlaceContext { photos: ContextPhoto[]; reviews: ContextReview[]; locality: string; localityPhotos: ContextPhoto[] }

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// Semnătura împiedică folosirea proxy-ului /api/place-photo pentru alte poze
// decât cele pe care le-am pus noi în site (cheia Google rămâne pe server).
export function signPhotoRef(ref: string): string {
  return createHmac('sha256', process.env.GOOGLE_PLACES_API_KEY || '').update(ref).digest('hex').slice(0, 32)
}

// Pozele trec prin proxy-ul nostru (fără copiere, cum cer regulile Google Maps),
// deci au nevoie de cheia Google din env-ul serverului, nu doar din Setări.
export function photosSupported(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY
}

// „Str. X 12, Ocna Șugatag 437210, România” → „Ocna Șugatag”
export function localityFromAddress(address: string, fallback: string): string {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  const candidate = parts.length >= 2 ? parts[parts.length - 2] : ''
  const clean = candidate.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
  return clean.length >= 3 ? clean : fallback.replace(' 🏘️', '').trim()
}

async function googleDetails(placeId: string, key: string) {
  const u = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  u.searchParams.set('place_id', placeId)
  u.searchParams.set('fields', 'photos,reviews')
  u.searchParams.set('language', 'ro')
  u.searchParams.set('key', key)
  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) })
  const d = await res.json()
  return (d.result || {}) as {
    photos?: { photo_reference: string; width?: number; html_attributions?: string[] }[]
    reviews?: { author_name?: string; rating?: number; text?: string; relative_time_description?: string }[]
  }
}

async function commonsPhotos(query: string, limit: number): Promise<ContextPhoto[]> {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`, gsrlimit: '10',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1600', origin: '*',
  }).forEach(([k, v]) => u.searchParams.set(k, v))
  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': 'OutreachPro/1.0 (website concept generator)' },
    signal: AbortSignal.timeout(6000),
  })
  const d = await res.json()
  type Page = { imageinfo?: { thumburl?: string; mime?: string; width?: number; extmetadata?: Record<string, { value?: string }> }[] }
  return (Object.values(d.query?.pages || {}) as Page[])
    .map(p => p.imageinfo?.[0])
    .filter((i): i is NonNullable<typeof i> => !!i?.thumburl && i.mime === 'image/jpeg' && (i.width || 0) >= 1000)
    .slice(0, limit)
    .map(i => {
      const artist = strip(i.extmetadata?.Artist?.value || 'autor necunoscut')
      const license = strip(i.extmetadata?.LicenseShortName?.value || 'licență liberă')
      return { url: i.thumburl!, credit: `Foto: ${artist} · ${license} · Wikimedia Commons` }
    })
}

export async function placeContext(opts: { placeId: string; address: string; city: string; googleKey?: string; origin: string }): Promise<PlaceContext> {
  const locality = localityFromAddress(opts.address, opts.city)
  const ctx: PlaceContext = { photos: [], reviews: [], locality, localityPhotos: [] }

  const key = process.env.GOOGLE_PLACES_API_KEY || opts.googleKey
  if (key) {
    try {
      const r = await googleDetails(opts.placeId, key)
      ctx.reviews = (r.reviews || [])
        .filter(rv => (rv.text || '').trim().length >= 20)
        .map(rv => ({ author: (rv.author_name || '').split(' ')[0], rating: rv.rating || 0, text: (rv.text || '').trim().slice(0, 500), when: rv.relative_time_description || '' }))
      if (photosSupported()) {
        ctx.photos = (r.photos || []).slice(0, 8).map(p => ({
          url: `${opts.origin}/api/place-photo?ref=${encodeURIComponent(p.photo_reference)}&sig=${signPhotoRef(p.photo_reference)}`,
          credit: `Foto: Google Maps${p.html_attributions?.[0] ? ` · ${strip(p.html_attributions[0])}` : ''}`,
        }))
      }
    } catch {}
  }

  // Poze ale localității doar dacă afacerea are puține poze proprii
  if (ctx.photos.length < 4) {
    try { ctx.localityPhotos = await commonsPhotos(locality, 3) } catch {}
  }
  return ctx
}
