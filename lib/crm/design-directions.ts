// Direcții artistice pentru demo-uri: fiecare site primește alt stil (tipografie, paletă, compoziție, semnătură),
// ales automat după meserie și diferit de ultimele demo-uri, ca portofoliul să nu arate ca un șablon repetat.
// Toate sunt moderne (gradiente, sticlă, mișcare, carusele, galerie), după modelul site-ului Cabanele Rus, dar cu alt caracter.

export type CategoryGroup = 'hospitality' | 'beauty' | 'food' | 'trades' | 'auto' | 'services'

export interface DesignDirection {
  id: string
  name: string            // afișat în aplicație (română)
  groups: CategoryGroup[]
  mood: string
  fonts: string
  palette: string
  hero: string
  headline: string
  nav: string
  signature: string
  sections: string
}

export const DIRECTIONS: DesignDirection[] = [
  {
    id: 'forest-ember', name: 'Modern · Pădure & jar', groups: ['hospitality', 'food', 'services'],
    mood: 'natural, cald, primitor, premium',
    fonts: 'Fraunces 400–700 (serif modern) pentru titluri + Inter 400–600 pentru text',
    palette: 'bază închisă #0f1d16 și #16291f, hârtie #fbf7f0 / crem #f7f0e4, text #1d1a16, gri #6b645a; accent GRADIENT #f2b65a → #e2725b → #c8442e',
    hero: 'slideshow pe tot ecranul (100svh) cu 3–5 cele mai bune poze, fiecare cu zoom lent (Ken Burns) și trecere prin fade; voal în gradient de la stânga și de jos, pentru lizibilitate; indicatori verticali în dreapta',
    headline: 'titlu mare Fraunces, cu 2–3 cuvinte-accent în gradient animat (background-clip:text)',
    nav: 'transparentă peste hero, devine sticlă închisă (backdrop-filter blur 18px) după scroll; buton principal pastilă în gradient',
    signature: 'bandă cu cuvinte care rulează între hero și conținut + o ștampilă rotundă în gradient care se rotește încet peste colajul de poze',
    sections: 'intro cu colaj de 3 poze suprapuse; carduri mari pe fundal închis, cu carusel de poze; bento cu legende din sticlă; galerie masonry cu filtre; secțiune CTA cu poză în fundal; contact cu card închis și formular alb',
  },
  {
    id: 'ocean-glass', name: 'Modern · Ocean de sticlă', groups: ['services', 'trades', 'beauty'],
    mood: 'proaspăt, curat, luminos, de încredere',
    fonts: 'Plus Jakarta Sans 500–800 pentru titluri + Inter 400–600 pentru text',
    palette: 'bază #06232e (petrol închis), hârtie #f3fbfc, text #0b1f26, gri #5a7078; accent GRADIENT #22d3ee → #0ea5e9 → #14b8a6',
    hero: 'hero împărțit: text la stânga, la dreapta un teanc de 2–3 carduri din sticlă care plutesc ușor, fiecare cu o poză sau o iconiță SVG mare; în fundal, forme în gradient (mesh) care se mișcă foarte încet',
    headline: 'titlu sans îngroșat (800), strâns (tracking -0.03em), cu un cuvânt subliniat de o linie în gradient care se desenează la încărcare',
    nav: 'pastilă din sticlă albă care plutește la 12px de sus, cu umbră moale; butonul „Sună” plin, în gradient',
    signature: 'carduri din sticlă (fundal rgba alb, blur 16px, bordură subțire luminoasă) folosite peste tot, plus o linie ondulată SVG între secțiuni',
    sections: 'servicii în grilă de carduri cu iconițe SVG și hover cu înclinare ușoară; pași „Cum lucrăm” pe o linie de timp; listă cu bife „Ce primești”; întrebări frecvente în acordeon; zona deservită; contact',
  },
  {
    id: 'noir-gold', name: 'Modern · Noir auriu', groups: ['beauty', 'food', 'auto', 'hospitality'],
    mood: 'elegant, nocturn, exclusivist',
    fonts: 'Playfair Display 400–700 italic pentru titluri + Inter 300–500 pentru text',
    palette: 'bază #0b0b0c, carduri #141414, hârtie #f6f1e7, text crem #ece6d8, gri #8d8778; accent GRADIENT auriu #f5d08a → #c9973f',
    hero: 'poza principală pe tot ecranul, cu vignetă și o trecere lentă între 3 poze; titlu centrat, deasupra lui o etichetă cu linii aurii fine de o parte și de alta',
    headline: 'cuvintele apar pe rând (blur → clar), unul sau două în italic auriu',
    nav: 'transparentă, cu linkuri subțiri; devine neagră din sticlă la scroll; buton contur auriu',
    signature: 'secțiuni numerotate (01, 02, 03) cu cifre mari aurii în contur, linii aurii de 1px și colțuri ușor teșite',
    sections: 'servicii sau meniu ca listă elegantă cu prețuri doar dacă există; galerie pe coloane cu efect de mărire; citate mari; rezervare sau programare; contact pe fond negru',
  },
  {
    id: 'sage-terracotta', name: 'Modern · Salvie & teracotă', groups: ['food', 'hospitality', 'beauty'],
    mood: 'artizanal, cald, mediteranean',
    fonts: 'DM Serif Display pentru titluri + DM Sans 400–600 pentru text',
    palette: 'bază #1f2a24 (salvie închisă), hârtie #f4efe6, text #22201c, gri #6f675d; accent GRADIENT #e07a5f → #f2cc8f',
    hero: 'cadru inserat: hero-ul stă într-un container cu colțuri de 32px și padding de 14px, cu slideshow de poze și zoom lent; titlul jos-stânga, iar jos-dreapta un card din sticlă cu un detaliu real (oraș, program sau rating)',
    headline: 'rândurile titlului urcă pe rând dintr-o mască (overflow hidden), 0.9s',
    nav: 'albă, solidă, cu linie fină jos; butonul principal în teracotă',
    signature: 'secțiunile se suprapun ca niște foi (colțuri de 48px sus, margin-top -48px), alternând crem cu salvie închisă',
    sections: 'poveste scurtă cu 2 poze în arc; carduri cu carusel; bento cu poze; recenzii doar dacă există; galerie cu filtre; contact',
  },
  {
    id: 'midnight-neon', name: 'Modern · Neon de noapte', groups: ['auto', 'trades', 'services'],
    mood: 'tehnic, energic, precis',
    fonts: 'Space Grotesk 500–700 pentru titluri + Inter 400–500 pentru text',
    palette: 'bază #0a0f1f, carduri #111833, hârtie #eef2ff, text #e6ebff, gri #8a93b8; accent GRADIENT #6366f1 → #22d3ee',
    hero: 'hero împărțit: titlu uriaș la stânga, la dreapta poza principală într-un chenar cu bordură luminoasă în gradient care se rotește încet; fundal cu grilă fină de linii',
    headline: 'titlu cu un cuvânt în gradient și un cursor care clipește la final (doar la încărcare)',
    nav: 'bară din sticlă închisă, cu un punct verde „Disponibil acum” lângă butonul de sunat',
    signature: 'carduri cu bordură luminoasă care urmărește cursorul (pe desktop) și cifre mari pentru pași / ani / zone, doar cu informații reale',
    sections: 'servicii în carduri tehnice cu iconițe; proces în pași numerotați; lucrări în galerie cu filtre; zonă deservită; contact cu buton mare de sunat',
  },
  {
    id: 'rose-blush', name: 'Modern · Roz pudrat', groups: ['beauty', 'services', 'food'],
    mood: 'feminin, delicat, luxos',
    fonts: 'Cormorant Garamond 500–700 pentru titluri + Montserrat 400–500 pentru text',
    palette: 'bază #2a1720 (prună), hârtie #fff6f4, text #2b1d22, gri #85707a; accent GRADIENT #f9a8d4 → #fb7185 → #f97316',
    hero: 'poza principală într-o formă cu colțuri foarte rotunjite (arc sus) la dreapta, text la stânga, sfere de culoare estompate (blur mare) în fundal care se mișcă foarte încet',
    headline: 'titlu serif mare, cu un cuvânt în italic și gradient',
    nav: 'pastilă din sticlă roz pal, centrată; buton „Programează-te” în gradient',
    signature: 'forme de arc pentru poze, iconițe fine cu linie subțire și separatoare cu ornament mic',
    sections: 'servicii ca meniu elegant; înainte/după sau galerie dacă sunt poze; echipa doar dacă există; programare; contact',
  },
  {
    id: 'sunny-fresh', name: 'Modern · Proaspăt & vesel', groups: ['trades', 'services', 'food'],
    mood: 'prietenos, optimist, accesibil',
    fonts: 'Plus Jakarta Sans 600–800 pentru titluri (cu accente în Fraunces italic) + Inter pentru text',
    palette: 'bază #0f2a1d, hârtie #fffdf6, text #18241c, gri #66705f; accent GRADIENT #a3e635 → #22c55e → #14b8a6, plus un galben cald #facc15 pentru etichete',
    hero: 'hero luminos: text mare la stânga, la dreapta un colaj jucăuș de poze sau ilustrații SVG cu insigne rotunde care se rotesc încet; fundal cu forme organice în gradient',
    headline: 'titlu îndrăzneț, cu un cuvânt evidențiat ca un marcator (bandă de culoare în spatele textului care se desenează)',
    nav: 'albă, cu buton „Sună acum” în gradient și număr de telefon vizibil pe desktop',
    signature: 'insigne-autocolant rotunde („Rapid”, „Garantat” doar dacă e adevărat), colțuri foarte rotunjite (28px) și mici animații la hover',
    sections: 'servicii în carduri colorate; cum lucrăm în 3 pași; ce primești (listă cu bife); întrebări frecvente; zonă deservită; contact cu formular scurt',
  },
  {
    id: 'alpine-blue', name: 'Modern · Albastru alpin', groups: ['hospitality', 'auto', 'services'],
    mood: 'aerisit, panoramic, liniștit',
    fonts: 'Syne 600–800 pentru titluri + Inter 400–500 pentru text',
    palette: 'bază #0c1b2e, hârtie #f4f7fb, text #0f1b2a, gri #63738a; accent GRADIENT #93c5fd → #3b82f6 → #1e3a8a',
    hero: 'panoramă pe tot ecranul cu parallax ușor la scroll și 3 carduri de sticlă jos cu informații reale (locație, capacitate, ce oferă)',
    headline: 'titlu mare, majuscule largi (Syne), care apare literă cu literă',
    nav: 'transparentă, devine albă din sticlă la scroll',
    signature: 'secțiuni largi cu poze panoramice pe toată lățimea, separate de bande cu statistici reale în sticlă',
    sections: 'unități de cazare sau servicii cu carusel; experiențe în bento; galerie cu filtre; cum ajungi; contact',
  },
]

export const CRAFT_RULES = `SITE MODERN, DE NIVEL PREMIUM (obligatoriu), după modelul celor mai bune site-uri din nișa afacerii:
- Folosește tot ce e modern și arată bine: gradiente (din paleta direcției), glassmorphism (fundal semitransparent + backdrop-filter blur + bordură subțire luminoasă), mișcare discretă și elegantă, poze mari. Totul adaptat nișei: natural pentru cazare, curat pentru servicii, elegant pentru beauty etc.
- POZELE SUNT VEDETA: dacă există poze, primul ecran le folosește (slideshow cu zoom lent sau compoziția din direcție). Dacă sunt multe poze: carusele (scroll-snap, săgeți, contor „1 / 8”), galerie masonry cu filtre și vizualizare pe tot ecranul (lightbox cu glisare pe telefon, săgeți și Esc pe desktop, contor). Dacă sunt puține sau deloc: ilustrații SVG, forme în gradient și iconițe, niciodată poze inventate.
- Structură potrivită afacerii (alege și ordonează): hero; bandă scurtă cu ce o face specială; intro cu colaj de poze; serviciile / unitățile (carduri cu carusel sau iconițe); de ce noi / experiențe (bento cu legende din sticlă); galerie; cum lucrăm sau cum ajungi; întrebări frecvente (doar întrebări reale, cu răspunsuri care nu inventează); secțiune finală cu îndemn (CTA) și poză în fundal; contact (card închis cu date + formular alb); subsol.
- Tipografie: 2 familii Google Fonts (preconnect, display=swap). H1 cu clamp(40px, 7vw, 96px), line-height 1–1.1. Etichete mici uppercase cu linie în gradient în față.
- Butoane pastilă: principal în gradient, cu umbră colorată și ridicare la hover; secundar din sticlă.
- Mișcare: apariții la scroll cu IntersectionObserver (translateY 30px + opacity, 0.9s, cubic-bezier(.22,1,.36,1), cu mici întârzieri între elemente). OBLIGATORIU: clasa care ascunde elementele se aplică doar după ce JS pornește (html.js), iar după 2,5 s totul devine vizibil oricum; parallax limitat la ±60px; ramură prefers-reduced-motion care oprește animațiile. Fără animații care țin conținutul ascuns.
- Pe telefon: meniu ☰ pe tot ecranul (se închide la click pe link), o bară fixă jos din sticlă cu „Sună” și „WhatsApp” (sau „Cere ofertă”) care apare după hero, fără scroll orizontal, carduri pe o coloană, poze cu înălțimi fixe.
- Text: în limba site-ului, specific afacerii, cu beneficii concrete; titluri de 3–9 cuvinte; fără lorem ipsum. Nu inventa prețuri, ani, număr de clienți, recenzii sau premii.
- Cod compact (ca să se genereze repede): CSS cu variabile în :root, fără biblioteci externe în afară de Google Fonts, JavaScript vanilla scurt (sub ~150 de rânduri).`

export function categoryGroup(key: string): CategoryGroup {
  const k = (key || '').toLowerCase()
  if (/pension|cabin|apartment|hotel|guest|villa|camping|cazare|accommodation|b_?and_?b/.test(k)) return 'hospitality'
  if (/beauty|hair|nail|barber|massage|spa|cosmetic|salon|tattoo|lash|brow/.test(k)) return 'beauty'
  if (/confection|catering|restaurant|cafe|bakery|pizza|food|bistro|cake|pastry/.test(k)) return 'food'
  if (/car|tyre|tire|auto|garage|mechanic|motor|wash|tow|recovery/.test(k)) return 'auto'
  if (/plumb|electric|roof|build|paint|window|boiler|heating|locksmith|clean|removal|garden|landscap|carpent|floor|tiler|handyman|construct/.test(k)) return 'trades'
  return 'services'
}

// Alege un stil potrivit meseriei, diferit de ultimele folosite (ca demo-urile consecutive să nu semene)
export function pickDirection(categoryKey: string, recent: string[], rand: () => number = Math.random): DesignDirection {
  const group = categoryGroup(categoryKey)
  const fit = DIRECTIONS.filter(d => d.groups.includes(group))
  const fresh = fit.filter(d => !recent.includes(d.id))
  const pool = fresh.length ? fresh : DIRECTIONS.filter(d => !recent.slice(0, 3).includes(d.id))
  const list = pool.length ? pool : DIRECTIONS
  return list[Math.floor(rand() * list.length) % list.length]
}

export const directionById = (id: string | null | undefined) => DIRECTIONS.find(d => d.id === id) || null

export function directionPrompt(d: DesignDirection) {
  return `DIRECȚIA ARTISTICĂ PENTRU ACEST SITE: „${d.name}” (respect-o exact, ca site-ul să arate diferit de celelalte):
- Atmosferă: ${d.mood}
- Fonturi: ${d.fonts}
- Paletă: ${d.palette}
- Hero: ${d.hero}
- Titlu: ${d.headline}
- Navigație: ${d.nav}
- Semnătura memorabilă a site-ului: ${d.signature}
- Secțiuni: ${d.sections}
Adaptează direcția la afacere și la pozele ei (dacă pozele sunt luminoase, păstrează contrastul și lizibilitatea), dar nu o înlocui cu un stil generic.

${CRAFT_RULES}`
}
