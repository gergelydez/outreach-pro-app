import { NextRequest, NextResponse } from 'next/server'
import { CITY_COORDINATES, BUSINESS_CATEGORIES } from '@/lib/constants'

export const maxDuration = 60

interface PlaceResult {
  place_id: string
  name: string
}

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
  }
}

function normalizePhoneForWhatsApp(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return '40' + digits.slice(1)
  if (digits.startsWith('40')) return digits
  return digits
}

// ── SCOR CONVERSIE 0-100 ─────────────────────────────────────────────────────
// 5 semnale cu ponderi: recenzii(30) + rating(25) + sezon(20) + oraș mic(15) + WA(10)
function calcConversionScore(
  rating: number, reviews: number, category: string,
  isSmallCity: boolean, hasWhatsApp: boolean
): number {
  let score = 0

  // 1. RECENZII — afacere activă cu volum real de clienți
  if      (reviews >= 100) score += 30
  else if (reviews >= 50)  score += 24
  else if (reviews >= 30)  score += 18
  else if (reviews >= 15)  score += 12
  else if (reviews >= 5)   score += 6
  else                     score += 0

  // 2. RATING — proprietar ambițios care investește în calitate
  if      (rating >= 4.8) score += 25
  else if (rating >= 4.5) score += 20
  else if (rating >= 4.0) score += 14
  else if (rating >= 3.5) score += 7
  else if (rating >  0)   score += 3
  else                    score += 8  // fără rating = afacere nouă, vrea să se stabilizeze

  // 3. SEZONALITATE — urgență reală acum (Paști, vară, nunți etc.)
  const month = new Date().getMonth() + 1
  const seasonMap: Record<string, number[]> = {
    bakery:       [3,4,11,12],
    florist:      [2,3,4,5,11,12],
    restaurant:   [3,4,5,6,7,8,12],
    lodging:      [5,6,7,8,12,1],
    photographer: [4,5,6,7,8,9,10],
    beauty_salon: [3,4,5,6,9,10,11,12],
    hair_care:    [3,4,5,6,9,10,11,12],
    car_repair:   [3,4,10,11],
    car_wash:     [3,4,5,6,7,8,9],
    gym:          [1,2,8,9],
    painter:      [4,5,6,7,8],
    dentist:      [1,2,3,4,5,6,7,8,9,10,11,12],
    doctor:       [1,2,3,4,5,6,7,8,9,10,11,12],
  }
  score += (seasonMap[category]?.includes(month)) ? 20 : 5

  // 4. ORAȘ MIC — concurență zero, primul cu site câștigă tot
  score += isSmallCity ? 15 : 0

  // 5. WHATSAPP — proprietarul e direct accesibil
  score += hasWhatsApp ? 10 : 0

  return Math.min(100, Math.max(0, score))
}

function getScoreLabel(score: number): { label: string; color: string; emoji: string } {
  if (score >= 80) return { label: 'Hot',   color: '#ef4444', emoji: '🔥' }
  if (score >= 65) return { label: 'Warm',  color: '#f97316', emoji: '⚡' }
  if (score >= 45) return { label: 'Maybe', color: '#eab308', emoji: '👍' }
  return              { label: 'Cold',  color: '#64748b', emoji: '❄️' }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { city, category, googleApiKey: clientKey } = body

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || clientKey
  if (!apiKey) return NextResponse.json({ error: 'Lipsă Google Places API key' }, { status: 400 })

  const coords = CITY_COORDINATES[city]
  if (!coords) return NextResponse.json({ error: `Oraș necunoscut: ${city}` }, { status: 400 })

  const nearbyUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  nearbyUrl.searchParams.set('location', `${coords.lat},${coords.lng}`)
  nearbyUrl.searchParams.set('radius', String(coords.radius))
  nearbyUrl.searchParams.set('type', category)
  nearbyUrl.searchParams.set('key', apiKey)

  const nearbyRes = await fetch(nearbyUrl.toString())
  const nearbyData = await nearbyRes.json()

  if (nearbyData.status !== 'OK' && nearbyData.status !== 'ZERO_RESULTS') {
    return NextResponse.json(
      { error: `Google API error: ${nearbyData.status} – ${nearbyData.error_message || ''}` },
      { status: 500 },
    )
  }

  const places: PlaceResult[] = nearbyData.results || []

  const detailsResults: PlaceDetails[] = await Promise.all(
    places.map(async (place) => {
      const detailUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
      detailUrl.searchParams.set('place_id', place.place_id)
      detailUrl.searchParams.set('fields',
        'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status')
      detailUrl.searchParams.set('key', apiKey)
      detailUrl.searchParams.set('language', 'ro')
      try { const res = await fetch(detailUrl.toString()); return res.json() }
      catch { return {} }
    }),
  )

  // ── MARKET SATURATION ANALYSIS ──────────────────────────────────────────
  // Câte afaceri EXISTĂ total vs câte NU au site = saturația pieței
  const allActive = detailsResults.filter(d => {
    const r = d.result || {}
    return r.business_status !== 'CLOSED_PERMANENTLY' &&
      (r.formatted_phone_number || r.international_phone_number)
  })
  const totalFound     = allActive.length
  const withWebsite    = allActive.filter(d => !!d.result?.website).length
  const withoutWebsite = totalFound - withWebsite
  const saturationPct  = totalFound > 0 ? Math.round((withWebsite / totalFound) * 100) : 0
  const opportunityPct = 100 - saturationPct

  const marketVerdict =
    saturationPct <= 20 ? { label:'Goldmine', emoji:'💎', color:'#4ade80',
      msg:`${opportunityPct}% fără site — concurență minimă, tu ești primul` }
    : saturationPct <= 40 ? { label:'Excelent', emoji:'🔥', color:'#f97316',
      msg:`${opportunityPct}% fără site — piață activă cu mulți clienți potențiali` }
    : saturationPct <= 60 ? { label:'Bun',      emoji:'⚡', color:'#eab308',
      msg:`${opportunityPct}% fără site — merită, dar concurența există` }
    : saturationPct <= 80 ? { label:'Mediu',    emoji:'👍', color:'#64748b',
      msg:`Doar ${opportunityPct}% fără site — piață parțial saturată` }
    :                       { label:'Saturat',  emoji:'❄️', color:'#ef4444',
      msg:`Doar ${opportunityPct}% fără site — schimbă categoria sau orașul` }

  const businesses = detailsResults
    .map((d, i) => ({ d, place: places[i] }))
    .filter(({ d }) => {
      const r = d.result || {}
      return (
        r.business_status !== 'CLOSED_PERMANENTLY' &&
        !r.website &&
        (r.formatted_phone_number || r.international_phone_number)
      )
    })
    .map(({ d, place }) => {
      const r        = d.result || {}
      const phone    = r.formatted_phone_number || ''
      const intlPhone= r.international_phone_number || ''
      const waNumber = normalizePhoneForWhatsApp(intlPhone || phone)
      const rating   = r.rating || 0
      const reviews  = r.user_ratings_total || 0
      const isSmall  = coords.isSmall || false

      const conversionScore = calcConversionScore(rating, reviews, category, isSmall, !!waNumber)
      const { label, color, emoji } = getScoreLabel(conversionScore)

      return {
        place_id:          place.place_id,
        name:              r.name || place.name,
        address:           r.formatted_address || '',
        phone,
        phone_intl:        waNumber,
        whatsapp_link:     waNumber ? `https://wa.me/${waNumber}` : '',
        rating,
        reviews_count:     reviews,
        category,
        category_label:    BUSINESS_CATEGORIES[category] || category,
        city,
        is_small_city:     isSmall,
        conversion_score:  conversionScore,
        score_label:       label,
        score_color:       color,
        score_emoji:       emoji,
        contact_email:     '',
        generated_subject: '',
        generated_body:    '',
        generated_whatsapp:'',
        status:            'found',
        contact_method:    waNumber ? 'whatsapp' : 'none',
        created_at:        new Date().toISOString(),
      }
    })
    .sort((a, b) => b.conversion_score - a.conversion_score)

  return NextResponse.json({
    businesses,
    total: businesses.length,
    market: {
      totalFound,
      withWebsite,
      withoutWebsite,
      saturationPct,
      opportunityPct,
      verdict: marketVerdict,
    }
  })
}
