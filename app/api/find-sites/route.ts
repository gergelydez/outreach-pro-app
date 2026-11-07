import { NextRequest, NextResponse } from 'next/server'
import { CITY_COORDINATES, BUSINESS_CATEGORIES } from '@/lib/constants'

export const maxDuration = 60

// Caută afaceri pentru fluxul "Rebuild Their Site": cele CU site (pentru
// redesign) și, opțional, cele FĂRĂ site propriu (doar Maps / Facebook), pentru
// care facem primul site. O singură pagină Google (max 20 rezultate) — listă
// mică și țintită, nu extragere în masă.

interface PlaceDetails {
  result?: {
    name?: string
    formatted_address?: string
    formatted_phone_number?: string
    international_phone_number?: string
    website?: string
    rating?: number
    user_ratings_total?: number
    business_status?: string
    opening_hours?: { weekday_text?: string[] }
    reviews?: { time?: number }[]
    url?: string                  // linkul oficial Google Maps al locației
  }
}

// Categorii cu bilet mare — clienți care își permit un site de 1500-5000 RON
const HIGH_TICKET: Record<string, number> = {
  dentist: 20, lawyer: 20, doctor: 18, physiotherapist: 16, veterinary_care: 15,
  accounting: 16, real_estate_agency: 18, lodging: 17, car_dealer: 18, used_car_dealer: 14,
  car_repair: 13, auto_body: 13, restaurant: 12, gym: 13, spa: 14, beauty_salon: 11,
  moving_company: 13, electrician: 12, plumber: 12, roofing_contractor: 15,
  general_contractor: 16, furniture_store: 14, car_rental: 14, insurance_agency: 16,
}

// Semnale că afacerea face bani: volum recenzii (50) + rating (30) + categorie (20)
function revenueScore(rating: number, reviews: number, category: string): number {
  let s = 0
  if      (reviews >= 300) s += 50
  else if (reviews >= 150) s += 42
  else if (reviews >= 80)  s += 34
  else if (reviews >= 40)  s += 25
  else if (reviews >= 15)  s += 14
  else                     s += 4

  if      (rating >= 4.7) s += 30
  else if (rating >= 4.4) s += 24
  else if (rating >= 4.0) s += 16
  else if (rating > 0)    s += 6

  s += HIGH_TICKET[category] ?? 8
  return Math.min(100, s)
}

function normalizePhoneForWhatsApp(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return '40' + digits.slice(1)
  return digits
}

// Directoare / rețele sociale nu sunt "site-ul lor" — nu le putem reface
const NOT_A_SITE = /facebook\.com|instagram\.com|linktr\.ee|google\.com|business\.site|tiktok\.com|booksy\.com|wa\.me|youtube\.com/i

export async function POST(req: NextRequest) {
  const { city, category, minReviews = 15, includeNoSite = true, onlyRecent = true, pages = 1, skipIds = [], googleApiKey: clientKey } = await req.json()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || clientKey
  if (!apiKey) return NextResponse.json({ error: 'Lipsă Google Places API key (Setări)' }, { status: 400 })

  const coords = CITY_COORDINATES[city]
  if (!coords) return NextResponse.json({ error: `Oraș necunoscut: ${city}` }, { status: 400 })

  const nearbyUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  nearbyUrl.searchParams.set('location', `${coords.lat},${coords.lng}`)
  nearbyUrl.searchParams.set('radius', String(coords.radius))
  nearbyUrl.searchParams.set('type', category)
  nearbyUrl.searchParams.set('key', apiKey)

  const nearbyData = await (await fetch(nearbyUrl.toString())).json()
  if (nearbyData.status !== 'OK' && nearbyData.status !== 'ZERO_RESULTS') {
    return NextResponse.json(
      { error: `Google API error: ${nearbyData.status} – ${nearbyData.error_message || ''}` },
      { status: 500 },
    )
  }

  // Până la 3 pagini (60 de rezultate) — folosit de prospectarea pe județ. Google
  // activează next_page_token abia după ~2 secunde.
  type NearbyPlace = { place_id: string; name: string; user_ratings_total?: number }
  const all: NearbyPlace[] = [...(nearbyData.results || [])]
  let token: string | undefined = nearbyData.next_page_token
  for (let page = 1; page < Math.min(3, Math.max(1, pages)) && token; page++) {
    await new Promise(r => setTimeout(r, 2000))
    const u = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
    u.searchParams.set('pagetoken', token)
    u.searchParams.set('key', apiKey)
    const next = await (await fetch(u.toString())).json()
    all.push(...(next.results || []))
    token = next.next_page_token
  }

  // Detaliile costă bani — cerem doar pentru cele cu destule recenzii și pe care
  // clientul nu le are deja (orașele dintr-un județ se suprapun)
  const skip = new Set<string>(skipIds)
  const places: NearbyPlace[] = all.filter(p => (p.user_ratings_total || 0) >= minReviews && !skip.has(p.place_id))

  const details: PlaceDetails[] = await Promise.all(places.map(async place => {
    const u = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    u.searchParams.set('place_id', place.place_id)
    u.searchParams.set('fields',
      'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status,opening_hours,reviews,url')
    // cele mai noi 5 recenzii (implicit Google le dă pe „cele mai relevante”) — ca să vedem dacă afacerea e activă anul ăsta
    u.searchParams.set('reviews_sort', 'newest')
    u.searchParams.set('language', 'ro')
    u.searchParams.set('key', apiKey)
    try { return await (await fetch(u.toString())).json() } catch { return {} }
  }))

  let skippedNoSite = 0
  let skippedClosed = 0
  let skippedStale = 0
  const lastReviewTime = (r: NonNullable<PlaceDetails['result']>) =>
    Math.max(0, ...(r.reviews || []).map(rv => rv.time || 0))
  const businesses = details
    .map((d, i) => ({ r: d.result || {}, place: places[i] }))
    .filter(({ r }) => {
      // Doar afaceri active: Google marchează închiderile permanente și temporare
      if (r.business_status && r.business_status !== 'OPERATIONAL') { skippedClosed++; return false }
      // Activă anul ăsta = cel puțin o recenzie din anul calendaristic curent
      if (onlyRecent && lastReviewTime(r) < yearStart) { skippedStale++; return false }
      if (!r.website || NOT_A_SITE.test(r.website)) {
        skippedNoSite++
        // fără site propriu: îi păstrăm doar dacă au telefon (altfel nu-i putem contacta)
        return includeNoSite && !!(r.formatted_phone_number || r.international_phone_number)
      }
      return true
    })
    .map(({ r, place }) => {
      const phone = r.formatted_phone_number || ''
      const rating = r.rating || 0
      const reviews = r.user_ratings_total || 0
      const rev = revenueScore(rating, reviews, category)
      const lastRv = lastReviewTime(r)
      const reviewsThisYear = (r.reviews || []).filter(rv => (rv.time || 0) >= yearStart).length
      const noSite = !r.website || NOT_A_SITE.test(r.website)
      const social = noSite && r.website ? r.website : ''
      const hours = r.opening_hours?.weekday_text || []
      // Fără site nu avem ce audita: auditul e „nu are site propriu”, cu datele de pe Google
      const audit = noSite ? {
        url: '', final_url: social, reachable: false, https: false, mobile_friendly: false,
        load_ms: 0, html_kb: 0, copyright_year: null, outdated_score: 100,
        issues: [social ? 'Are doar pagină de social media, fără site propriu' : 'Nu are site propriu'],
        title: r.name || place.name, description: '', headings: [],
        text_excerpt: hours.length ? `Program (din Google): ${hours.join('; ')}` : '',
        emails: [], phones: phone ? [phone] : [], socials: social ? [social] : [],
        logo_url: '', images: [], audited_at: new Date().toISOString(),
      } : undefined
      return {
        place_id:          place.place_id,
        name:              r.name || place.name,
        address:           r.formatted_address || '',
        city,
        category,
        category_label:    BUSINESS_CATEGORIES[category] || category,
        phone,
        phone_intl:        normalizePhoneForWhatsApp(r.international_phone_number || phone),
        website:           noSite ? '' : r.website!,
        no_site:           noSite,
        maps_url:          r.url || '',
        last_review_at:    lastRv ? new Date(lastRv * 1000).toISOString() : '',
        reviews_this_year: reviewsThisYear,   // din cele mai noi 5 pe care le dă Google
        ...(audit ? { audit } : {}),
        rating,
        reviews_count:     reviews,
        revenue_score:     rev,
        opportunity_score: Math.round(noSite ? 60 + rev * 0.4 : rev * 0.4),
        demo_html:         '',
        preview_url:       '',
        contact_email:     '',
        message:           '',
        email_subject:     '',
        stage:             (noSite ? 'audited' : 'found') as 'audited' | 'found',
        notes:             '',
        created_at:        new Date().toISOString(),
      }
    })
    .sort((a, b) => b.revenue_score - a.revenue_score)

  return NextResponse.json({
    businesses,
    scanned: all.length,
    belowMinReviews: all.filter(p => (p.user_ratings_total || 0) < minReviews).length,
    withoutSite: skippedNoSite,
    closed: skippedClosed,
    stale: skippedStale,
  })
}
