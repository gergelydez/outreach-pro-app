import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CATEGORY_PAIN_POINTS } from '@/lib/constants'
import type { Business } from '@/lib/types'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    business,
    mode = 'both', // 'whatsapp' | 'email' | 'both'
    variant = 0,
    anthropicApiKey: clientKey,
    senderName,
    yourWebsite,
    yourPortfolio,
    yourPhone,
    priceFrom = '500',
    priceTo = '1500',
    deliveryDays = '5',
  }: {
    business: Business
    mode?: string
    variant?: number
    anthropicApiKey?: string
    senderName?: string
    yourWebsite?: string
    yourPortfolio?: string
    yourPhone?: string
    priceFrom?: string
    priceTo?: string
    deliveryDays?: string
  } = body

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey
  if (!apiKey) {
    return NextResponse.json({ error: 'Lipsă Anthropic API key' }, { status: 400 })
  }

  const ctx = CATEGORY_PAIN_POINTS[business.category] ?? CATEGORY_PAIN_POINTS['default']
  const name      = process.env.SENDER_NAME        || senderName    || 'Alexandru'
  const website   = process.env.YOUR_WEBSITE       || yourWebsite   || ''
  const portfolio = process.env.YOUR_PORTFOLIO_URL || yourPortfolio || ''
  const phone     = process.env.YOUR_PHONE         || yourPhone     || ''
  const pFrom     = process.env.PRICE_FROM         || priceFrom
  const pTo       = process.env.PRICE_TO           || priceTo
  const days      = process.env.DELIVERY_DAYS      || deliveryDays

  const ratingCtx =
    business.rating >= 4.0 && business.reviews_count >= 10
      ? `${business.reviews_count} recenzii cu ${business.rating}★ pe Google`
      : business.reviews_count >= 5
      ? `${business.reviews_count} recenzii pe Google`
      : ''

  const smallCityCtx = business.is_small_city
    ? `În ${business.city} nu există concurență online în domeniu – au avantaj clar față de competitori.`
    : ''

  const client = new Anthropic({ apiKey })

  const results: { subject?: string; body?: string; whatsapp?: string } = {}

  // ─── WhatsApp message ───────────────────────────────────────────────────────
  if (mode === 'whatsapp' || mode === 'both') {
    const openings = [
      'Bună ziua! Am văzut că',
      'Salut! Am observat că',
      'Bună! Am găsit',
      'Bună ziua,',
    ]
    const opening = openings[variant % 4]

    const waPrompt = `Ești un freelancer român care face site-uri pentru afaceri locale. Scrie un mesaj WhatsApp SCURT și NATURAL pentru o afacere care nu are site web.

DATE AFACERE:
- Nume: ${business.name}
- Tip: ${business.category_label}
- Oraș: ${business.city}
- Recenzii Google: ${ratingCtx || 'nu știm'}
- Context local: ${smallCityCtx || 'oraș normal'}

OFERTA TA:
- Faci site-uri profesionale în ${days} zile
- Preț: ${pFrom}-${pTo} RON (tot inclus: domeniu, hosting, SEO de bază)
- Beneficiu principal pentru ei: ${ctx.waHook}
${portfolio ? `- Portofoliu: ${portfolio}` : ''}
${phone ? `- Telefonul tău: ${phone}` : ''}

PSIHOLOGIA CONVERTIRII MAXIME:
1. Începe cu "${opening}" și observă ceva SPECIFIC despre ei (recenzii, locație, tip afacere)
2. Arată că știi EXACT ce pierd fără site (folosește ${ctx.waHook})
3. Ofertă concretă cu preț fix – oamenii cumpără când știu exact costul
4. Dacă au recenzii bune: "Cu ${ratingCtx} merită o prezență online pe măsura reputației"
5. Dacă e oraș mic: "În ${business.city} nu prea există concurență online – avantaj imens"
6. Termină cu O SINGURĂ întrebare simplă, nu agresivă

REGULI STRICTE WhatsApp:
- MAX 5 rânduri scurte (ecran de telefon!)
- Sună 100% uman, de la om la om, NU bot sau template
- Menționează numele afacerii o singură dată
- MAX 1-2 emoji (nu mai mult!)
- FĂRĂ "Stimate", "Vă contactez", "Sper că ești bine", bullet points
- Semnează cu "${name}" la final
- Varianta ${variant + 1}/4 – ton ușor diferit față de celelalte variante

Returnează DOAR mesajul WhatsApp, fără explicații, fără ghilimele.`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 350,
        messages: [{ role: 'user', content: waPrompt }],
      })
      results.whatsapp = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    } catch (e) {
      // fallback WhatsApp
      results.whatsapp = `${opening} ${business.name} din ${business.city} nu are site web.\n\nFac site-uri profesionale pentru ${business.category_label.toLowerCase()} în ${days} zile, ${pFrom} RON tot inclus (domeniu + hosting).\n\nBeneficiu: ${ctx.waHook}.${portfolio ? `\n\nExemple: ${portfolio}` : ''}\n\nVă interesează?\n${name}`
    }
  }

  // ─── Email ──────────────────────────────────────────────────────────────────
  if (mode === 'email' || mode === 'both') {
    const emailPrompt = `Ești un expert în copywriting de vânzări pentru IMM-uri din România. Scrie un email de cold outreach cu conversie MAXIMĂ pentru o afacere locală fără website.

DATE AFACERE:
- Nume: ${business.name}
- Tip: ${business.category_label}
- Oraș: ${business.city}
- Recenzii Google: ${ratingCtx || 'fără detalii'}
- Context local: ${smallCityCtx || ''}

CONTEXT DE VÂNZARE:
- Problema lor: ${ctx.pain}
- Ce câștigă: ${ctx.gain}
- Statistică de impact: ${ctx.hook}
- Urgența: ${ctx.urgency}

OFERTA:
- Website profesional în ${days} zile
- Preț: ${pFrom}-${pTo} RON (domeniu .ro + hosting + SEO incluse)
- Suport tehnic 3 luni inclus
${portfolio ? `- Portofoliu: ${portfolio}` : ''}
${website ? `- Site propriu: ${website}` : ''}

FORMULA DE CONVERSIE MAXIMĂ (aplică în ordine):
1. SUBJECT: Specifică, intrigant, personalizat cu numele afacerii – MAX 8 cuvinte – trezește curiozitate
2. DESCHIDERE: Compliment SPECIFIC bazat pe recenzii sau locație (nu generic)
3. AGITAREA PROBLEMEI: 2 rânduri care descriu exact ce pierd ACUM (cu statistică)
4. SOLUȚIE CLARĂ: Beneficii concrete, nu features tehnice – "mai mulți clienți" nu "responsive design"
5. DOVADĂ SOCIALĂ: "Am construit site-uri pentru [tip afacere] similare din [regiune]" 
6. URGENȚĂ REALĂ: De ce ACUM e momentul (sezon, concurență, etc.)
7. CTA SIMPLU: O singură acțiune – "Răspundeți la acest email" sau "Sunați la ${phone || '[telefon]'}"

REGULI:
- Scriere EXCLUSIV în română, "dumneavoastră" sau "voi"
- MAX 180 cuvinte în body – scurt și puternic convertește mai mult decât lung
- Ton: prietenos, direct, de la om la om – NU corporatist
- NU: "Stimate", "Vă contactez pentru", "Sper că sunteți bine", bullets în exces
- Menționează numele afacerii de 2 ori
- Semnează: ${name}${website ? `\n${website}` : ''}${phone ? `\n${phone}` : ''}

Returnează EXACT JSON (fără alt text, fără markdown):
{"subject": "subiect email", "body": "corp complet cu salut și semnătură"}`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: emailPrompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        results.subject = parsed.subject
        results.body    = parsed.body
      }
    } catch (e) {
      results.subject = `${business.name} – clienți noi din online de mâine`
      results.body    = `Bună ziua,\n\nAm observat că ${business.name} din ${business.city} nu are încă un website.\n\n${ctx.hook}\n\nConstruct site-uri profesionale pentru ${business.category_label.toLowerCase()} în ${days} zile, preț fix ${pFrom} RON (domeniu + hosting incluse).\n\nAm ajutat afaceri similare din regiune să obțină clienți noi lunar exclusiv din online.\n\n${ctx.urgency}\n\nRăspundeți la acest email pentru o ofertă personalizată gratuită.\n\n${name}${website ? `\n${website}` : ''}`
    }
  }

  return NextResponse.json(results)
}
