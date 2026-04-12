import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Business } from '@/lib/types'

// 300 secunde = 5 minute — suficient pentru 8000 tokens
// Necesită plan Vercel Pro. Pe Hobby folosim streaming.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    business,
    anthropicApiKey: clientKey,
    senderName,
    yourPhone,
    priceFrom = '500',
    deliveryDays = '5',
  }: {
    business: Business
    anthropicApiKey?: string
    senderName?: string
    yourPhone?: string
    priceFrom?: string
    deliveryDays?: string
  } = body

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) return NextResponse.json({ error: 'Lipsă API key' }, { status: 400 })

  const cityClean = business.city.replace(' 🏘️', '')
  const hasRating  = business.rating >= 4.2 && business.reviews_count >= 10
  const sName      = process.env.SENDER_NAME || senderName || 'Alexandru'
  const sPhone     = process.env.YOUR_PHONE  || yourPhone  || ''
  const pFrom      = process.env.PRICE_FROM  || priceFrom
  const days       = process.env.DELIVERY_DAYS || deliveryDays

  const COLOR_MAP: Record<string, string> = {
    beauty_salon: '#9d4edd', hair_care: '#9d4edd',
    lodging: '#2d6a4f', restaurant: '#d62828',
    bakery: '#c9a227', dentist: '#0077b6', doctor: '#0077b6',
    car_repair: '#1b4332', photographer: '#1d3557',
    gym: '#7209b7', florist: '#e63946', lawyer: '#1d3557',
    accounting: '#1d4ed8', veterinary_care: '#386641',
    moving_company: '#1d4ed8', physiotherapist: '#0077b6',
    car_wash: '#1b4332', painter: '#6c3d14',
  }
  const color      = COLOR_MAP[business.category] || '#1d4ed8'
  const domainSlug = business.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const waLink     = business.phone_intl ? `https://wa.me/${business.phone_intl}` : ''
  const telLink    = business.phone ? `tel:${business.phone.replace(/\s/g, '')}` : '#'
  const year       = new Date().getFullYear()

  const prompt = `Generează un site web demo COMPLET și PROFESIONIST în HTML/CSS pentru această afacere.

Afacere: ${business.name}
Tip: ${business.category_label}
Oraș: ${cityClean}
Telefon: ${business.phone || 'nedisponibil'}
${hasRating ? `Rating Google: ${business.rating}★ (${business.reviews_count} recenzii)` : ''}
Adresă: ${business.address || cityClean}
Culoare principală: ${color}
Domeniu sugerat: ${domainSlug}.ro

STRUCTURA OBLIGATORIE (toate secțiunile):
1. Banner sticky (fundal ${color}, text alb): "✨ DEMO PERSONALIZAT · Site în ${days} zile de la ${pFrom} RON · ${sName}${sPhone ? ' · ' + sPhone : ''}"
2. Navbar alb cu umbră: logo bold "${business.name}" + buton colorat "📞 Sună acum" cu href="${telLink}"
3. Hero secțiune mare (gradient ${color} → mai închis): h1 cu numele afacerii, subtitlu relevant domeniului, 2 butoane CTA (unul plin, unul outline)
4. Servicii grid: 6 carduri cu icon emoji mare, titlu, descriere scurtă — relevante pentru ${business.category_label}
5. Despre noi: 2-3 paragrafe convingătoare, specifice domeniului, cu ton cald
6. Galerie foto: 4 placeholder-uri (div cu fundal ${color}22, emoji mare centrat, text descriere jos)
7. ${hasRating
    ? `Recenzii: card mare cu rating ${business.rating}★ din ${business.reviews_count} recenzii Google + 2 testimoniale fictive credibile cu nume românești`
    : '3 testimoniale fictive pozitive și credibile cu nume românești'}
8. Contact: box cu gradient ${color}, telefon mare clickabil <a href="${telLink}">${business.phone || ''}</a>${waLink ? `, buton WhatsApp <a href="${waLink}">Scrie pe WhatsApp</a>` : ''}, adresa ${business.address || cityClean}
9. Footer întunecat (#1e293b): "${domainSlug}.ro" mare, copyright "${business.name} © ${year}", linie separatoare, "Site realizat de ${sName}${sPhone ? ' · ' + sPhone : ''} · De la ${pFrom} RON · Livrare în ${days} zile"

DESIGN:
- Font: system-ui sau -apple-system (fără Google Fonts)
- Border-radius generos (16-24px pe carduri)
- Umbre subtile: box-shadow: 0 4px 20px rgba(0,0,0,0.08)
- Animație fade-in la load: @keyframes fadeIn + animation pe body
- Hover effects pe butoane și carduri (transform: scale(1.02))
- Complet responsive cu media queries (breakpoint 768px)

REGULI TEHNICE:
- UN singur fișier HTML, tot CSS în <style>, tot JS în <script>
- ZERO dependențe externe, zero CDN, zero Google Fonts
- Telefon clickabil cu href="${telLink}"
${waLink ? `- WhatsApp: <a href="${waLink}">` : ''}
- Arată ca un site REAL livrat unui client, nu un template ieftin

Returnează DOAR codul HTML complet. Prima linie = <!DOCTYPE html>`

  try {
    const client = new Anthropic({ apiKey })

    // Folosim streaming pentru a evita timeout pe conexiuni lente
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })

    const message = await stream.finalMessage()
    const html = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    if (!html) return NextResponse.json({ error: 'Demo gol generat' }, { status: 500 })

    const finalHtml = html.startsWith('<!DOCTYPE') ? html : '<!DOCTYPE html>' + html
    return NextResponse.json({ demo_html: finalHtml })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
