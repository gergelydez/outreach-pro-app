import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CATEGORY_PAIN_POINTS, HU_PAIN_POINTS, HU_CITIES } from '@/lib/constants'
import type { Business } from '@/lib/types'

export const maxDuration = 60

function isHungarian(city: string): boolean {
  const clean = city.replace(' 🏘️', '').trim()
  return HU_CITIES.includes(clean)
}

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

  const isHU    = isHungarian(business.city)
  const lang    = isHU ? 'hu' : 'ro'

  // Selectează pain points pe limbă
  const ctxRO   = CATEGORY_PAIN_POINTS[business.category] ?? CATEGORY_PAIN_POINTS['default']
  const ctxHU   = HU_PAIN_POINTS[business.category] ?? HU_PAIN_POINTS['default']
  const ctx     = isHU ? ctxHU : ctxRO

  const name     = process.env.SENDER_NAME        || senderName    || 'Alexandru'
  const website  = process.env.YOUR_WEBSITE       || yourWebsite   || ''
  const portfolio= process.env.YOUR_PORTFOLIO_URL || yourPortfolio || ''
  const phone    = process.env.YOUR_PHONE         || yourPhone     || ''
  const pFrom    = process.env.PRICE_FROM         || priceFrom
  const pTo      = process.env.PRICE_TO           || priceTo
  const days     = process.env.DELIVERY_DAYS      || deliveryDays
  // Árak HU-ra HUF-ban (kb. 1 RON ≈ 75 HUF)
  const pFromHU  = String(Math.round(parseInt(pFrom) * 75 / 1000) * 1000)
  const pToHU    = String(Math.round(parseInt(pTo) * 75 / 1000) * 1000)

  const hasGoodRating  = business.rating >= 4.2 && business.reviews_count >= 10
  const hasManyReviews = business.reviews_count >= 50
  const cityClean      = business.city.replace(' 🏘️', '')
  const isSmall        = business.is_small_city

  const client = new Anthropic({ apiKey })
  const results: { subject?: string; body?: string; whatsapp?: string; demo_html?: string; lang?: string } = {}
  results.lang = lang

  // ── EMOTIONAL BENEFITS bilingual ─────────────────────────────────────────
  const BENEFITS_RO: Record<string, string> = {
    beauty_salon: 'cliente noi care vă găsesc pe Google și rezervă online fără să sune',
    hair_care: 'programări online non-stop, clienți noi din zonă în fiecare săptămână',
    lodging: 'rezervări directe fără să mai plătiți comision la Booking.com',
    restaurant: 'meniu digital, rezervări online și clienți noi care vă găsesc înainte să iasă',
    bakery: 'comenzi de torturi și produse online, mai ales pentru nunți și botezuri',
    dentist: 'programări online 24/7 și pacienți noi care caută stomatolog în zona voastră',
    car_repair: 'clienți noi care vă găsesc primii pe Google când au nevoie urgentă de service',
    photographer: 'mirei care vă găsesc portofoliul online și vă contactează direct',
    gym: 'abonamente noi și oameni care caută sală de fitness în zona voastră',
    florist: 'comenzi online de flori pentru nunți, botezuri și ocazii speciale',
    doctor: 'pacienți noi care vă caută online și programări fără apeluri telefonice',
    veterinary_care: 'proprietari de animale care vă găsesc urgent când au nevoie de veterinar',
    lawyer: 'clienți noi care caută avocat online în zona voastră',
    accounting: 'firme noi care caută contabil și vă găsesc pe Google',
    default: 'clienți noi care vă găsesc pe Google în fiecare zi',
  }
  const BENEFITS_HU: Record<string, string> = {
    beauty_salon: 'új ügyfelek akik Google-on találják meg és online foglalnak telefonálás nélkül',
    hair_care: 'online foglalások éjjel-nappal, új ügyfelek a környékről minden héten',
    lodging: 'közvetlen foglalások Booking.com jutalék nélkül',
    restaurant: 'digitális étlap, online asztalfoglalás és új vendégek akik online keresnek',
    bakery: 'online torta és termék rendelések, főleg esküvőkre és szülinapokra',
    dentist: '24/7 online időpontfoglalás és új betegek akik fogorvost keresnek a környéken',
    car_repair: 'új ügyfelek akik elsőként találják meg Google-n amikor sürgős szerelőt keresnek',
    photographer: 'párok akik megtalálják a portfólióját online és közvetlenül keresik meg',
    gym: 'új tagok és emberek akik edzőtermet keresnek a közelben',
    florist: 'online virágrendelések esküvőkre és különleges alkalmakra',
    doctor: 'új betegek akik online keresnek és telefonálás nélkül jelentkeznek',
    veterinary_care: 'állattulajdonosok akik sürgősen megtalálják amikor állatorvosra van szükségük',
    lawyer: 'new ügyfelek akik ügyvédet keresnek online a körzetben',
    accounting: 'új vállalkozások akik könyvelőt keresnek és Google-n találják meg',
    default: 'new ügyfelek akik minden nap megtalálják Google-n',
  }

  const emotionalBenefit = isHU
    ? (BENEFITS_HU[business.category] || BENEFITS_HU['default'])
    : (BENEFITS_RO[business.category] || BENEFITS_RO['default'])

  // ── CONTEXT ───────────────────────────────────────────────────────────────
  const personalContext = isHU
    ? (hasGoodRating
        ? hasManyReviews
          ? `${business.reviews_count} vélemény ${business.rating}★ — az egyik legjobb értékelésű vállalkozás ${cityClean}-ban, de teljesen láthatatlan online.`
          : `${business.reviews_count} Google vélemény ${business.rating}★ — jó hírnév, de nincs weboldal.`
        : business.reviews_count >= 3
        ? `${business.reviews_count} Google Maps vélemény, de nincs weboldal.`
        : `Aktív vállalkozás ${cityClean}-ban, de nincs online jelenlét.`)
    : (hasGoodRating
        ? hasManyReviews
          ? `Au ${business.reviews_count} recenzii cu ${business.rating}★ — una din cele mai apreciate afaceri din ${cityClean}, dar complet invizibili online.`
          : `Au ${business.reviews_count} recenzii cu ${business.rating}★ pe Google — reputație bună, dar fără site.`
        : business.reviews_count >= 3
        ? `Au ${business.reviews_count} recenzii pe Google Maps, dar nu au site web.`
        : `Afacere activă în ${cityClean}, fără nicio prezență online.`)

  const competitionContext = isHU
    ? (isSmall
        ? `${cityClean}-ban nincs egyetlen hasonló vállalkozás sem weboldallal — aki elsőként kerül fel a Google-ra, az nyer mindent.`
        : `${cityClean}-ban a weboldallal rendelkező versenytársak elsőként jelennek meg Google-n és elviszik az online ügyfeleket.`)
    : (isSmall
        ? `În ${cityClean} nu există nicio afacere similară cu site web — cine apare primul câștigă tot.`
        : `În ${cityClean}, concurenții cu site apar primii pe Google și iau clienții care caută online.`)

  // ── WHATSAPP ─────────────────────────────────────────────────────────────
  if (mode === 'whatsapp' || mode === 'both') {

    const toneVariantsRO = [
      { tone: 'cald și direct, ca un prieten care îți dă un sfat sincer', greeting: 'Bună ziua' },
      { tone: 'profesionist dar uman, ca un consultant cu o propunere concretă', greeting: 'Bună ziua' },
      { tone: 'entuziast și pozitiv, ca cineva care a descoperit o oportunitate pentru ei', greeting: 'Bună ziua' },
      { tone: 'empatic și înțelegător, arătând că înțelegi provocările unui proprietar', greeting: 'Bună ziua' },
    ]
    const toneVariantsHU = [
      { tone: 'meleg és közvetlen, mint egy barát aki őszinte tanácsot ad', greeting: 'Tisztelt' },
      { tone: 'professzionális de emberi, mint egy tanácsadó aki konkrét ajánlattal jön', greeting: 'Jó napot' },
      { tone: 'lelkes és pozitív, mint aki épp lehetőséget fedezett fel számukra', greeting: 'Tisztelt' },
      { tone: 'empatikus és megértő, mutatva hogy érti egy vállalkozó kihívásait', greeting: 'Jó napot' },
    ]

    const toneVariants = isHU ? toneVariantsHU : toneVariantsRO
    const { tone, greeting } = toneVariants[variant % 4]

    const waPromptHU = `Ön egy weboldal-készítő szabadúszó aki helyi magyar vállalkozásoknak készít weboldalakat és már tucatnyi tulajdonosnak segített több ügyfelet szerezni online.

━━━ A VÁLLALKOZÁS ADATAI ━━━
Név: ${business.name}
T�pus: ${business.category_label}
Város: ${cityClean}
Helyzet: ${personalContext}
Versenyhelyzet: ${competitionContext}

━━━ MIT KÍNÁL ━━━
- Teljes professzionális weboldal ${days} nap alatt
- Megfizethető ár: ${pFromHU} Ft-tól (minden benne: domain, tárhely 1 év, SEO, mobilbarát)
- INGYENES személyre szabott demo az ő nevükkel — látják mielőtt bármit döntenek
- Fő előny NEKIK: ${emotionalBenefit}
${portfolio ? `- Portfólió példák: ${portfolio}` : ''}

━━━ AZ ÜZENET KÖTELEZŐ SZERKEZETE ━━━
Írja meg az üzenetet PONTOSAN ebben a sorrendben:

1. KÖSZÖNTÉS: Kezdje "${greeting} [cégnév]!" — egyszerű, természetes, udvarias

2. KÖZVETLEN MEGFIGYELÉS (1 sor): Mondja el hogy épp kereste [vállalkozástípus] ${cityClean}-ban Google-n és látta hogy ${business.name}-nak nincs weboldala. Legyen közvetlen, ne dramatizálja.

3. ELŐNYÖK ÉS ÉRZÉSEK (2-3 sor):
   - Mutassa meg mit veszítenek konkrétan: ügyfelek akik online keresik és a konkurenciához mennek
   - Adja el az ÉRZÉST: több ügyfél, csörgő telefon, foglalások amik maguktól jönnek
   - Képzeltesse el: "Képzelje el hogy valaki ${cityClean}-ban keres [típus]-t és a ${business.name} jön fel elsőként"
   ${hasGoodRating ? `- Említse meg a véleményeiket: ${business.reviews_count} vélemény ${business.rating}★ megérdemel egy méltó online jelenlétet` : ''}

4. EGYÉRTELMŰ AJÁNLAT ÁRRAL (1-2 sor):
   - Mondja el világosan hogy weboldalt készít ${pFromHU} Ft-tól, minden benne (domain, tárhely, mobil, SEO)
   - Átadás ${days} nap alatt
   - Ingyenes demo: "Készíthetek egy ingyenes demót az Ön nevével hogy pontosan lássa hogyan nézne ki, semmilyen kötelezettség nélkül"

5. ZÁRÓ KÉRDÉS (1 sor): Kérdezze meg közvetlenül hogy érdekli-e az ingyenes demo. Egyszerűen, nyomás nélkül.

6. ALÁÍRÁS: Csak "${name}"${phone ? ` és a telefonszám ${phone}` : ''}

━━━ HANGNEM SZABÁLYOK ━━━
- Hangnem: ${tone}
- Írjon "Önnek/Önök" — udvarias forma
- Nincs vállalati szöveg: "szolgáltatások", "megoldások", "csomagok", "promóció"
- Nincs "Tisztelt Uram/Hölgyem", "Üdvözlettel", "Remélem jól van"
- Természetes, mint egy kézzel írt üzenet, nem mint egy sablon
- Rövid bekezdések — maximum 2-3 sor
- ÖSSZES üzenet: maximum 150-180 szó — tömör és lényegre törő

Csak a kész üzenetet adja vissza, idézőjelek és magyarázat nélkül.`

    const waPromptRO = `Ești un freelancer român care face site-uri web pentru afaceri locale și ai ajutat zeci de proprietari să obțină mai mulți clienți online.

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
1. SALUT: Începe cu "Bună ziua!" — simplu, natural, politicos
2. OBSERVAȚIE DIRECTĂ (1 rând): Ai văzut că ${business.name} nu are site web în ${cityClean}
3. BENEFICII ȘI SENTIMENTE (2-3 rânduri): ce pierd, sentimentul, vizualizare
   ${hasGoodRating ? `- Menționează recenziile: ${business.reviews_count} recenzii de ${business.rating}★` : ''}
4. OFERTĂ CLARĂ: de la ${pFrom} RON, ${days} zile, tot inclus + demo GRATUIT
5. ÎNTREBARE FINALĂ: simplu, fără presiune
6. SEMNĂTURĂ: ${name}${phone ? '\n' + phone : ''}

REGULI: ton ${tone}, "dumneavoastră", max 150 cuvinte, natural nu template.
Returnează DOAR mesajul final.`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: isHU ? waPromptHU : waPromptRO }],
      })
      results.whatsapp = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    } catch {
      results.whatsapp = isHU
        ? `${greeting} ${business.name}!\n\nÉpp Google-on kerestem ${business.category_label.toLowerCase()}-t ${cityClean}-ban és láttam hogy Önöknek nincs weboldaluk.\n\nMinden nap vannak emberek akik pontosan azt keresik amit Önök kínálnak — és a konkurenciához mennek mert online nem találják meg Önöket. Weboldallal ${emotionalBenefit}.\n\nProfesszionális weboldalakat készítek ${pFromHU} Ft-tól, minden benne (domain, tárhely, mobil, SEO), ${days} nap alatt. Készíthetek egy ingyenes demót az Ön nevével hogy pontosan lássa hogyan nézne ki, kötelezettség nélkül.\n\nÉrdekli az ingyenes demo?\n\n${name}${phone ? '\n' + phone : ''}`
        : `Bună ziua!\n\nTocmai am căutat ${business.category_label.toLowerCase()} în ${cityClean} pe Google și am observat că ${business.name} nu are site web.\n\nÎn fiecare zi există oameni care caută exact ce oferiți voi — și ajung la concurență. Cu un site, ${emotionalBenefit}.\n\nFac site-uri profesionale de la ${pFrom} RON, tot inclus, livrat în ${days} zile. Pot să vă fac un demo gratuit cu numele vostru, fără nicio obligație.\n\nSunteți interesați să vedeți demo-ul?\n\n${name}${phone ? '\n' + phone : ''}`
    }
  }

  // ── EMAIL ─────────────────────────────────────────────────────────────────
  if (mode === 'email' || mode === 'both') {
    const emailPromptHU = `Ön egy profi értékesítési szövegíró a magyar piacon. Írjon egy cold outreach emailt maximális konverzióval.

VÁLLALKOZÁS ADATAI:
Név: ${business.name} | Típus: ${business.category_label} | Város: ${cityClean}
Helyzet: ${personalContext} | ${competitionContext}
Fő előny: ${emotionalBenefit}

AJÁNLAT:
- Teljes weboldal ${days} nap alatt, ${pFromHU} Ft-tól (domain + tárhely + SEO + mobilbarát, minden benne)
- INGYENES személyre szabott demo — látják mielőtt döntenek
${portfolio ? `- Portfólió: ${portfolio}` : ''}

KÖTELEZŐ SZERKEZET:
T�RGY: Személyre szabott "${business.name}"-vel — rövid, specifikus, kíváncsiságot kelt (max 7 szó)
T�RZS: 1. Természetes köszöntés | 2. Megfigyelés: nincs weboldal | 3. Mit veszítenek | 4. Előnyök | 5. Ajánlat ${pFromHU} Ft-tól + ingyenes demo | 6. CTA | 7. Aláírás: ${name}${phone ? '\n' + phone : ''}

SZABÁLYOK: MAX 150 szó, emberi és közvetlen hang, "Ön/Önök", nincs felsorolás.
Visszaad PONTOSAN JSON markdown nélkül: {"subject":"...","body":"..."}`

    const emailPromptRO = `Ești un copywriter expert. Scrie un email cold outreach cu conversie maximă.
Afacere: ${business.name} | ${business.category_label} | ${cityClean}
Situație: ${personalContext} | ${competitionContext} | Beneficiu: ${emotionalBenefit}
Ofertă: de la ${pFrom} RON, ${days} zile, tot inclus + demo GRATUIT
SUBJECT: personalizat cu "${business.name}", max 7 cuvinte
BODY: salut → observație → pierderi → beneficii → ofertă → CTA → ${name}${phone ? '\n' + phone : ''}
MAX 150 cuvinte, ton uman, "dumneavoastră".
Returnează EXACT JSON fără markdown: {"subject":"...","body":"..."}`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: isHU ? emailPromptHU : emailPromptRO }],
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
      results.subject = isHU
        ? `Weboldal ${business.name}-nak — ${pFromHU} Ft-tól`
        : `Site web pentru ${business.name} — de la ${pFrom} RON`
      results.body = isHU
        ? `Jó napot,\n\nLáttam hogy ${business.name} ${cityClean}-ban nincs weboldala. Minden nap keresnek ${business.category_label.toLowerCase()}-t online — és a konkurenciához mennek.\n\nProfesszionális weboldalakat készítek ${pFromHU} Ft-tól (domain, tárhely, SEO, mobil), ${days} nap alatt. Ingyenes demót is készíthetek az Ön nevével.\n\nSzeretnék küldeni?\n\n${name}${phone ? '\n' + phone : ''}`
        : `Bună ziua,\n\nAm observat că ${business.name} din ${cityClean} nu are site web. Oameni din zonă caută ${business.category_label.toLowerCase()} online și ajung la concurență.\n\nFac site-uri de la ${pFrom} RON, tot inclus, în ${days} zile. Pot pregăti un demo gratuit.\n\nVreți să vi-l trimit?\n\n${name}${phone ? '\n' + phone : ''}`
    }
  }

  // ── FOLLOW-UP ─────────────────────────────────────────────────────────────
  if (mode === 'followup') {
    const replyText = (body as Record<string,string>).replyText || ''

    const followupPromptHU = `Ön egy weboldal-készítő szabadúszó. Egy potenciális ügyfél válaszolt a WhatsApp üzenetére.
KONTEXTUS: Vállalkozás: ${business.name} (${business.category_label}, ${cityClean}) | Ár: ${pFromHU} Ft-tól, ${days} nap, INGYENES demo
Az ügyfél válasza: "${replyText}"
FELADAT: Írjon természetes, hatékony WhatsApp választ ami: direkten reagál | ha érdeklődő → ajánlja az INGYENES demót | ha árat kérdez → ${pFromHU} Ft-tól minden benne + demo | kifogásnál → semlegesítse és ajánlja a demót
SZABÁLYOK: MAX 3-4 sor | természetes, emberi | nincs nyomás | mindig ajánlja az ingyenes demót | aláírás: "${name}"${phone ? ' + ' + phone : ''}
Csak az üzenetet adja vissza.`

    const followupPromptRO = `Ești un freelancer care face site-uri. Un client a răspuns la mesajul tău WhatsApp.
Context: ${business.name} (${cityClean}) | Tu oferi: de la ${pFrom} RON, ${days} zile, demo GRATUIT
Clientul a răspuns: "${replyText}"
Scrie un răspuns natural care: răspunde direct | dacă interesat → propune demo GRATUIT | dacă întreabă preț → confirmi ${pFrom} RON tot inclus + demo | dacă obiecții → neutralizează și propune demo
REGULI: MAX 3-4 rânduri | natural, uman | fără presiune | propune mereu demo-ul | semnează "${name}"${phone ? '\n' + phone : ''}
Returnează DOAR mesajul.`

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: isHU ? followupPromptHU : followupPromptRO }],
      })
      results.whatsapp = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    } catch {
      results.whatsapp = isHU
        ? `Köszönöm a választ!\n\nAhogy mondtam, készíthetek egy ingyenes demót "${business.name}" nevével — pontosan látja hogyan nézne ki a weboldal, semmilyen kötelezettség nélkül.\n\nKüldjek?\n\n${name}${phone ? '\n' + phone : ''}`
        : `Bună ziua! Mulțumesc pentru răspuns.\n\nPot să vă pregătesc un demo gratuit cu "${business.name}" — vedeți exact cum ar arăta, fără nicio obligație.\n\nVreți să vi-l trimit?\n\n${name}${phone ? '\n' + phone : ''}`
    }
  }

  return NextResponse.json(results)
}
