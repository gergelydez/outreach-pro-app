import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CATEGORY_PAIN_POINTS } from '@/lib/constants'
import type { Business } from '@/lib/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    business,
    mode = 'whatsapp',
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
  if (!apiKey) return NextResponse.json({ error: 'Lipsă Anthropic API key' }, { status: 400 })

  const ctx      = CATEGORY_PAIN_POINTS[business.category] ?? CATEGORY_PAIN_POINTS['default']
  const name     = process.env.SENDER_NAME        || senderName    || 'Alexandru'
  const website  = process.env.YOUR_WEBSITE       || yourWebsite   || ''
  const portfolio= process.env.YOUR_PORTFOLIO_URL || yourPortfolio || ''
  const phone    = process.env.YOUR_PHONE         || yourPhone     || ''
  const pFrom    = process.env.PRICE_FROM         || priceFrom
  const pTo      = process.env.PRICE_TO           || priceTo
  const days     = process.env.DELIVERY_DAYS      || deliveryDays

  const hasGoodRating  = business.rating >= 4.2 && business.reviews_count >= 10
  const hasManyReviews = business.reviews_count >= 50
  const cityClean      = business.city.replace(' 🏘️', '')
  const isSmall        = business.is_small_city

  // Beneficii emoționale specifice per categorie
  const EMOTIONAL_BENEFITS: Record<string, string> = {
    beauty_salon:    'cliente noi care vă găsesc pe Google și rezervă online fără să sune',
    hair_care:       'programări online non-stop, clienți noi din zonă în fiecare săptămână',
    lodging:         'rezervări directe fără să mai plătiți comision la Booking.com',
    restaurant:      'meniu digital, rezervări online și clienți noi care vă găsesc înainte să iasă din casă',
    bakery:          'comenzi de torturi și produse online, mai ales pentru nunți, botezuri și zile de naștere',
    dentist:         'programări online 24/7 și pacienți noi care caută stomatolog în zona voastră',
    car_repair:      'clienți noi care vă găsesc primii pe Google când au nevoie urgentă de service',
    photographer:    'mirei care vă găsesc portofoliul online și vă contactează direct',
    gym:             'abonamente noi și oameni care caută sală de fitness în zona voastră',
    florist:         'comenzi online de flori pentru nunți, botezuri și ocazii speciale',
    doctor:          'pacienți noi care vă caută online și programări fără apeluri telefonice',
    veterinary_care: 'proprietari de animale care vă găsesc urgent când au nevoie de veterinar',
    lawyer:          'clienți noi care caută avocat online în zona voastră',
    accounting:      'firme noi care caută contabil și vă găsesc pe Google',
    moving_company:  'cereri de ofertă online de la oameni care se mută în zona voastră',
    physiotherapist: 'pacienți noi din recomandări online și programări directe',
    car_wash:        'clienți noi care caută spălătorie auto pe Google Maps în zonă',
    painter:         'cereri de ofertă pentru renovări de la oameni din zona voastră',
    default:         'clienți noi care vă găsesc pe Google în fiecare zi',
  }
  const emotionalBenefit = EMOTIONAL_BENEFITS[business.category] || EMOTIONAL_BENEFITS['default']

  // Pretext de personalizare bazat pe datele disponibile
  const personalContext = hasGoodRating
    ? hasManyReviews
      ? `Au ${business.reviews_count} recenzii cu ${business.rating}★ — una din cele mai apreciate afaceri din ${cityClean} în domeniu, dar complet invizibili online.`
      : `Au ${business.reviews_count} recenzii cu ${business.rating}★ pe Google — reputație bună, dar fără site.`
    : business.reviews_count >= 3
    ? `Au ${business.reviews_count} recenzii pe Google Maps, dar nu au site web.`
    : `Afacere activă în ${cityClean}, fără nicio prezență online.`

  const competitionContext = isSmall
    ? `În ${cityClean} nu există nicio afacere similară cu site web — cine apare primul pe Google câștigă tot.`
    : `În ${cityClean}, concurenții cu site web apar primii în Google și iau clienții care caută online.`

  const client = new Anthropic({ apiKey })
  const results: { subject?: string; body?: string; whatsapp?: string; demo_html?: string } = {}

  // ── WHATSAPP ─────────────────────────────────────────────────────────────────
  if (mode === 'whatsapp' || mode === 'both') {

    // Variații de ton pentru a nu părea template trimis în masă
    const toneVariants = [
      { tone: 'cald și direct, ca un prieten care îți dă un sfat sincer', greeting: 'Bună ziua' },
      { tone: 'profesionist dar uman, ca un consultant care vine cu o propunere concretă', greeting: 'Bună ziua' },
      { tone: 'entuziast și pozitiv, ca cineva care tocmai a descoperit o oportunitate pentru ei', greeting: 'Bună ziua' },
      { tone: 'empatic și înțelegător, arătând că înțelegi provocările unui proprietar de afacere', greeting: 'Bună ziua' },
    ]
    const { tone, greeting } = toneVariants[variant % 4]

    const waPrompt = `Ești un freelancer român care face site-uri web pentru afaceri locale și ai ajutat zeci de proprietari să obțină mai mulți clienți online.

━━━ DATELE AFACERII ━━━
Nume: ${business.name}
Tip: ${business.category_label}
Oraș: ${cityClean}
Situație: ${personalContext}
Concurență: ${competitionContext}

━━━ CE OFERI TU ━━━
- Site web profesional complet în ${days} zile
- Preț accesibil: între ${pFrom} și ${pTo} RON (tot inclus: domeniu .ro, hosting 1 an, SEO, mobil)
- Demo GRATUIT personalizat cu numele lor — îl văd înainte să decidă orice
- Beneficiul principal pentru EI: ${emotionalBenefit}
${portfolio ? `- Portofoliu exemple: ${portfolio}` : ''}

━━━ STRUCTURA OBLIGATORIE A MESAJULUI ━━━
Scrie mesajul urmând EXACT aceste 5 părți, în această ordine:

1. SALUT: Începe cu "${greeting}!" — simplu, natural, politicos

2. OBSERVAȚIE DIRECTĂ (1 rând): Spune că tocmai ai căutat [tipul afacerii] în ${cityClean} pe Google și ai văzut că ${business.name} nu are site web. Fii direct, nu dramatiza.

3. BENEFICII ȘI SENTIMENTE (2-3 rânduri): 
   - Arată ce pierd concret: clienți care îi caută online și ajung la concurență
   - Vinde SENTIMENTUL: mai mulți clienți, telefoane care sună, rezervări care vin singure, liniște că afacerea crește
   - Fă-i să vizualizeze cum ar fi să aibă site: "Imaginați-vă că cineva caută [tip] în ${cityClean} și găsește ${business.name} primul"
   ${hasGoodRating ? `- Menționează recenziile lor: cu ${business.reviews_count} recenzii de ${business.rating}★ merită o prezență online pe măsura reputației` : ''}

4. OFERTĂ CLARĂ CU PREȚ (1-2 rânduri):
   - Spune clar că faci site-uri de la ${pFrom} RON, tot inclus (domeniu, hosting, mobil, SEO)
   - Livrare în ${days} zile
   - Menționează demo-ul GRATUIT: "Pot să vă fac un demo gratuit cu numele vostru să vedeți exact cum ar arăta, fără nicio obligație"

5. ÎNTREBARE FINALĂ (1 rând): Întreabă direct dacă sunt interesați să vadă demo-ul gratuit sau dacă vor mai multe detalii. Simplu, fără presiune.

6. SEMNĂTURĂ: Doar "${name}"${phone ? ` și numărul de telefon ${phone}` : ''}

━━━ REGULI DE TON ━━━
- Ton: ${tone}
- Scrie la "dumneavoastră" — respectuos
- Fără cuvinte corporatiste: "servicii", "soluții", "pachete", "promovare"
- Fără "Stimate", "Cu stimă", "Sper că ești bine"
- Natural, ca un mesaj scris manual, nu ca un template evident
- Paragrafele să fie scurte — maxim 2-3 rânduri fiecare
- TOTAL mesaj: maxim 150-180 cuvinte — clar și la obiect

Returnează DOAR mesajul final, gata de trimis. Fără ghilimele, fără explicații.`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: waPrompt }],
      })
      results.whatsapp = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    } catch {
      // Fallback clar și structural
      results.whatsapp = `Bună ziua!\n\nTocmai am căutat ${business.category_label.toLowerCase()} în ${cityClean} pe Google și am observat că ${business.name} nu are site web.\n\nÎn fiecare zi există oameni care caută exact ce oferiți voi — și ajung la concurență doar pentru că nu vă găsesc online. Cu un site, ${emotionalBenefit}.\n\nFac site-uri profesionale de la ${pFrom} RON, tot inclus (domeniu, hosting, mobil, SEO), livrat în ${days} zile. Pot să vă fac și un demo gratuit cu numele vostru să vedeți exact cum ar arăta, fără nicio obligație.\n\nSunteți interesați să vedeți demo-ul?\n\n${name}${phone ? '\n' + phone : ''}`
    }
  }

  // ── EMAIL ────────────────────────────────────────────────────────────────────
  if (mode === 'email' || mode === 'both') {
    const emailPrompt = `Ești un copywriter expert în vânzări pentru piața românească. Scrie un email de cold outreach cu structură clară și conversie maximă.

━━━ DATELE AFACERII ━━━
Nume: ${business.name}
Tip: ${business.category_label}
Oraș: ${cityClean}
Situație: ${personalContext}
${competitionContext}
Beneficiu principal: ${emotionalBenefit}
${ctx.urgency ? `Urgență: ${ctx.urgency}` : ''}

━━━ OFERTA ━━━
- Site web complet în ${days} zile, de la ${pFrom} RON (domeniu + hosting + SEO + mobil, tot inclus)
- Demo GRATUIT personalizat — văd cum arată înainte să decidă
${portfolio ? `- Portofoliu: ${portfolio}` : ''}
${website ? `- Site meu: ${website}` : ''}

━━━ STRUCTURA OBLIGATORIE ━━━
SUBJECT: Personalizat cu "${business.name}" — scurt, specific, trezește curiozitate (max 7 cuvinte)

BODY în ordine:
1. Salut natural (nu "Stimate")
2. Observație directă: ai văzut că ${business.name} nu are site
3. Ce pierd: clienți reali care îi caută online, concurența îi ia
4. Beneficii emoționale: ${emotionalBenefit}
5. Ofertă clară: preț de la ${pFrom} RON, ${days} zile, tot inclus + demo gratuit
6. CTA simplu: să răspundă dacă vor demo-ul gratuit
7. Semnătură: ${name}${phone ? '\n' + phone : ''}${website ? '\n' + website : ''}

REGULI: MAX 150 cuvinte, ton uman și direct, "dumneavoastră", fără bullet points, fără corporatism.

Returnează EXACT JSON fără markdown:
{"subject":"...","body":"..."}`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
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
    } catch {
      results.subject = `Site web pentru ${business.name} — de la ${pFrom} RON`
      results.body    = `Bună ziua,\n\nAm observat că ${business.name} din ${cityClean} nu are site web.\n\nÎn fiecare zi, oameni din ${cityClean} caută ${business.category_label.toLowerCase()} pe Google — și ajung la concurență. Cu un site, ${emotionalBenefit}.\n\nFac site-uri profesionale de la ${pFrom} RON, tot inclus (domeniu, hosting, SEO, mobil), livrat în ${days} zile. Pot să vă pregătesc un demo gratuit cu numele vostru să vedeți exact cum ar arăta.\n\nVreți să vă trimit demo-ul?\n\n${name}${phone ? '\n' + phone : ''}${website ? '\n' + website : ''}`
    }
  }

  // ── DEMO HTML ────────────────────────────────────────────────────────────────
  if (mode === 'demo') {
    const demoPrompt = `Ești un web designer expert. Generează un site web demo COMPLET și PROFESIONIST în HTML/CSS pentru afacerea de mai jos.

DATELE AFACERII:
Nume: ${business.name}
Tip: ${business.category_label}
Categorie: ${business.category}
Oraș: ${cityClean}
Telefon: ${business.phone || 'nedisponibil'}
${hasGoodRating ? `Rating Google: ${business.rating}★ (${business.reviews_count} recenzii)` : ''}
Adresă: ${business.address || cityClean}

STRUCTURA SITE-ULUI:
1. Banner sus (sticky): "✨ DEMO PERSONALIZAT · Site complet în ${days} zile de la ${pFrom} RON · ${name}${phone ? ' · ' + phone : ''}"
2. Navbar: logo (numele afacerii) + buton "Sună acum" cu telefonul
3. Hero: gradient cu culori specifice tipului de afacere, titlu mare, subtitlu, 2 butoane CTA
4. Servicii: 4-6 carduri cu iconuri emoji relevante
5. Despre noi: text convingător specific domeniului
6. Galerie: 4 placeholder-uri descriptive
7. ${hasGoodRating ? `Recenzii: afișează rating-ul real ${business.rating}★ din ${business.reviews_count} recenzii` : 'Recenzii: 3 recenzii fictive pozitive și credibile'}
8. Contact: box cu gradient, telefon clickabil, WhatsApp
9. Footer: domeniu sugerat + "Site realizat de ${name}${phone ? ' · ' + phone : ''} · De la ${pFrom} RON · ${days} zile"

CULORI pe tip:
- pensiune/hotel: #2d6a4f verde
- salon/coafor/beauty: #9d4edd violet
- restaurant/cafenea: #d62828 roșu
- dentist/medic: #0077b6 albastru
- service auto: #1b4332 verde închis
- foto/video: #1d3557 bleumarin
- patiserie/brutărie: #c9a227 auriu
- fitness: #7209b7 mov
- florărie: #e63946 roșu cald
- altele: #1d4ed8 albastru profesional

REGULI TEHNICE:
- Un singur fișier HTML cu CSS și JS inline
- Fără dependențe externe — merge offline
- Telefon clickabil: <a href="tel:${business.phone?.replace(/\s/g,'') || ''}">
- WhatsApp: https://wa.me/${business.phone_intl || ''}
- Mobile responsive
- Arată ca un site REAL, nu ca un template

Returnează DOAR codul HTML complet. Începe direct cu <!DOCTYPE html>`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: demoPrompt }],
      })
      const html = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
      results.demo_html = html.startsWith('<!DOCTYPE') ? html : '<!DOCTYPE html>' + html
    } catch {
      results.demo_html = ''
    }
  }

  // ── FOLLOW-UP (după răspuns client) ─────────────────────────────────────────
  if (mode === 'followup') {
    const replyText = (body as Record<string,string>).replyText || ''

    const followupPrompt = `Ești un freelancer care face site-uri web. Un client potențial a răspuns la mesajul tău WhatsApp.

CONTEXTUL:
- Afacerea: ${business.name} (${business.category_label}, ${cityClean})
- Tu oferi: site-uri de la ${pFrom} RON, în ${days} zile, cu demo GRATUIT
- Ce a răspuns clientul: "${replyText}"

MISIUNEA TA:
Scrie un răspuns WhatsApp natural și eficient care:
- Răspunde direct la ce a spus el
- Dacă e interesat sau neutru → propune să îi trimiți demo-ul GRATUIT ca pas următor
- Dacă întreabă de preț → confirmi că e de la ${pFrom} RON tot inclus și propui demo-ul
- Dacă are obiecții → neutralizează calm și propune demo-ul fără obligații
- Dacă spune că are deja site → întreabă politicos când a fost actualizat și dacă apare pe Google

REGULI:
- MAX 3-4 rânduri
- Natural, uman, de la om la om
- Ton cald și fără presiune
- Propune ÎNTOTDEAUNA demo-ul gratuit ca pas următor logic
- Semnează cu "${name}"${phone ? ' și ' + phone : ''}

Returnează DOAR mesajul, gata de trimis.`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: followupPrompt }],
      })
      results.whatsapp = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    } catch {
      results.whatsapp = `Bună ziua! Mulțumesc pentru răspuns.\n\nCum am zis, pot să vă pregătesc un demo gratuit cu numele "${business.name}" — vedeți exact cum ar arăta site-ul vostru, fără nicio obligație.\n\nVreți să vi-l trimit?\n\n${name}${phone ? '\n' + phone : ''}`
    }
  }

  return NextResponse.json(results)
}

