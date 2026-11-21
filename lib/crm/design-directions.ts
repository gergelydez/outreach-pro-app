// Direcții artistice pentru demo-uri: fiecare site primește alt stil (tipografie, paletă, compoziție, semnătură),
// ales automat după meserie și diferit de ultimele demo-uri, ca portofoliul să nu arate ca un șablon repetat.
// Regulile de „craft” sunt adaptate după principiile de design din skill-ul MotionSites (gallery-grade pages).

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
    id: 'alpine-editorial', name: 'Editorial alpin', groups: ['hospitality', 'food', 'services'],
    mood: 'calm, natural, premium',
    fonts: 'Instrument Serif (italic pentru 1–3 cuvinte-accent din titlu, într-o nuanță mai stinsă) + Inter 300–500 pentru rest',
    palette: 'fundal #f7f5f0, text #141414, gri #6f6f6f, borduri rgba(20,20,20,.12), accent verde de pădure #2f5d46 (doar pe butonul principal, puncte și un glif)',
    hero: 'inset-frame: hero-ul stă într-un padding de 16px, cu poza principală full-bleed într-un container cu radius 32px; titlul ancorat jos-stânga peste poză (text-shadow 0 16px 38px rgba(0,0,0,.32)), un element secundar jos-dreapta (rating Google + număr recenzii)',
    headline: 'rândurile titlului urcă din 110% în overflow:hidden (masked line rise), 0.9s, cubic-bezier(0.22,1,0.36,1), 0.12s între rânduri',
    nav: 'pastilă albă plutitoare (logo-text cu ®-ul mic · linkuri 14px · buton închis la culoare), umbră moale după scroll',
    signature: 'secțiunile se suprapun ca niște foi: fiecare secțiune nouă are border-radius 48px 48px 0 0 și margin-top -48px, alternând crem și verde închis #1d3a2c',
    sections: 'despre în grilă asimetrică 26% / 1fr / 48% cu poze aliniate la final; galerie bento 7/5/5/7; recenzii ca citate mari în serif italic',
  },
  {
    id: 'nocturne-cinematic', name: 'Cinematic nocturn', groups: ['hospitality', 'beauty', 'food', 'auto'],
    mood: 'nocturn, cinematic, scump',
    fonts: 'Instrument Serif italic pentru titluri mari (weight 400) + Barlow 300–500 pentru text și UI',
    palette: 'fundal #0a0a0a, text crem #DEDBC8, gri #8e8e8e, carduri #121212–#1a1a1a, borduri rgba(222,219,200,.14), accent chihlimbar #c8a46a pe maximum 3 tipuri de elemente',
    hero: 'centred stack peste poza principală full-bleed (100dvh), cu fade jos spre culoarea fundalului (fără voal negru plat), un badge mic deasupra titlului și 2 butoane pastilă',
    headline: 'cuvintele apar pe rând cu blur 10px→0 și opacity 0→1, 100ms între cuvinte',
    nav: 'nav transparent cu material de sticlă (backdrop-filter blur 14px, fundal rgba(255,255,255,.06)) pe pastila linkurilor; butonul principal crem, text negru',
    signature: 'un strat fin de grain SVG (fractal noise, opacity .06, pointer-events:none) peste toată pagina, care unește pozele și interfața',
    sections: 'carduri media 16/9 cu radius 24px, zoom 1.05 în 700ms la hover și disc de sticlă ↗; statistici mari subțiri (weight 300) cu etichete mici; secțiune de recenzii cu stele aurii',
  },
  {
    id: 'swiss-grid', name: 'Grilă elvețiană', groups: ['trades', 'services', 'auto'],
    mood: 'precis, sobru, de încredere',
    fonts: 'Inter Tight 500 pentru titluri (tracking −0.045em, niciodată bold) + Inter pentru text + JetBrains Mono 10–12px pentru etichete (uppercase, +0.2em, opacitate 55%)',
    palette: 'fundal #fcfcfc, text #111111, gri #8e8e8e, linii 1px rgba(17,17,17,.12), accent roșu semnal #e63b2e (buton principal, numere de index, un punct)',
    hero: 'editorial four corners: titlu foarte mare în centru-stânga, iar în cele 4 colțuri etichete mono (oraș + ora locală, „Disponibili azi”, rating, „Din anul …” doar dacă e cunoscut); o poză decupată dreapta',
    headline: 'per-caracter slide, 30ms între litere, o singură dată',
    nav: 'nav pe o linie, linkuri cu contor superscript mono (Servicii⁶), sublinierea crește de la stânga la hover',
    signature: 'grilă de 12 coloane vizibilă subtil (linii verticale 1px la marginile containerului) și indici [ 01 ] … [ 05 ] la fiecare secțiune',
    sections: 'servicii ca listă numerotată „/ NUME SERVICIU” cu descrieri scurte; proces în 3–4 pași cu „01 ——”; contact cu tabel de date clar',
  },
  {
    id: 'poster-bold', name: 'Afiș îndrăzneț', groups: ['trades', 'auto', 'services'],
    mood: 'energic, direct, curajos',
    fonts: 'Anton (uppercase, pentru cuvinte uriașe 14–22vw, line-height .82) + Inter 400–500 pentru text',
    palette: 'fundal #f0f0ee, text #0c0c0c, gri #6f6f6f, accent galben de siguranță #f5c400 (fundalul butonului principal și o bandă), negru #0c0c0c pentru secțiunile contrastante',
    hero: 'un cuvânt uriaș (meseria sau orașul) pe toată lățimea, cu poza principală tăiată într-un dreptunghi cu radius 24px suprapus peste partea de jos a cuvântului; dedesubt, o bandă cu 3 statistici despărțite de bare verticale',
    headline: 'cuvântul uriaș apare cu scale 0.96→1 și opacity 0→1 în 0.8s; restul pe rând de jos în sus',
    nav: 'pastilă neagră agățată de marginea de sus (hanging tab, radius jos 20px), linkuri albe 14px',
    signature: 'bandă marquee lentă (30s, liniară) cu serviciile, între secțiuni, pe fundal galben',
    sections: 'servicii în carduri mari cu iconițe SVG simple; secțiune „de ce noi” cu numere uriașe; CTA final pe fundal negru cu buton galben',
  },
  {
    id: 'soft-atelier', name: 'Atelier pastel', groups: ['beauty', 'food', 'services'],
    mood: 'delicat, luminos, feminin-modern',
    fonts: 'Source Serif 4 italic pentru accente + Poppins 300–500 pentru titluri și text',
    palette: 'fundal hârtie #fdf1e1, text #111411, gri #7d6f66, accent trandafiriu prăfuit #b5656b, carduri albe cu umbră 0 4px 16px rgba(0,0,0,.08) și radius 36px',
    hero: 'left column centrat vertical (titlu, subtitlu, 2 butoane, avatar stack cu 3 poze de clienți + rating) și dreapta un colaj de 3 poze în forme arcuite (border-radius 999px 999px 32px 32px)',
    headline: 'titlu în două tonuri: prima parte în culoarea textului, restul în accent mai deschis; apariție cu translateY 24px→0',
    nav: 'logo într-un cerc de 44px separat, linkurile într-o pastilă #f3e4d2, buton principal închis',
    signature: 'pastile-etichetă pentru servicii (min-height 40px, fundal hârtie, umbră 0 12px 30px rgba(0,0,0,.12)) plutind peste poze',
    sections: 'listă de prețuri elegantă cu linii punctate între serviciu și preț; galerie în tile-uri cu radius 40px; recenzii în carduri albe',
  },
  {
    id: 'terracotta-rustic', name: 'Rustic teracotă', groups: ['hospitality', 'food', 'trades'],
    mood: 'cald, autentic, primitor',
    fonts: 'DM Serif Display pentru titluri + Manrope 400–600 pentru text',
    palette: 'fundal #f4ece1, text #2b1d14, gri #7a6a5c, accent teracotă #c0643a, secțiuni contrastante în maro închis #2b1d14 cu text #f4ece1',
    hero: 'bottom-anchored: poza mare full-bleed, titlul jos-stânga pe o bandă cu fade de la transparent la fundal, iar jos-dreapta un card mic cu programul sau „Rezervă din timp”',
    headline: 'titlul pe 2–3 rânduri rupte manual, apariție cu blur 8px→0',
    nav: 'nav simplu pe fundal, logo-text cu ✦ după nume, buton teracotă',
    signature: 'texturi fine de hârtie (grain .05) și ilustrații SVG de linie (frunze, munți sau unelte, potrivit meseriei) ca ornamente mici lângă titlurile de secțiune',
    sections: 'poveste cu 2 poze suprapuse decalat; facilități ca iconițe SVG de linie cu text scurt; recenzii pe fundal maro',
  },
  {
    id: 'nordic-calm', name: 'Nordic calm', groups: ['services', 'hospitality', 'beauty'],
    mood: 'curat, liniștit, profesionist',
    fonts: 'Manrope 400–600 singur, titluri mari weight 500 cu tracking −0.035em',
    palette: 'fundal #f9fafb, text bleumarin închis #0D212C, gri #6b7a83, accent salvie #336443 cu nuanța deschisă #85AB8B pentru partea a doua a titlurilor',
    hero: 'centred stack aerisit: badge „Nou” cu cip interior, titlu în două tonuri, subtitlu de maximum 32rem, 2 butoane; dedesubt poza principală într-un container lat cu radius 32px',
    headline: 'apariție lină de jos în sus, în ordinea badge → titlu → subtitlu → butoane, 0.15s între ele',
    nav: 'pastilă plutitoare: logo · separator 1×20px · linkuri · separator · buton; capătă umbră după scroll',
    signature: 'butoane cu umbră fizică stratificată (0 1px 2px rgba(5,26,36,.1), 0 4px 4px rgba(5,26,36,.09), 0 9px 6px rgba(5,26,36,.05), inset 0 2px 8px rgba(255,255,255,.5))',
    sections: 'beneficii în carduri albe cu iconițe SVG de linie; întrebări frecvente în acordeon; contact cu formular curat pe 2 coloane',
  },
  {
    id: 'midnight-tech', name: 'Tehnic de noapte', groups: ['auto', 'services', 'trades'],
    mood: 'tehnic, precis, modern',
    fonts: 'Geist 400–500 pentru titluri și text + Geist Mono pentru etichete și cifre',
    palette: 'fundal #050505, text #ffffff, gri hsl(0 0% 60%), carduri hsl(0 0% 6%), borduri hsl(0 0% 14%), accent turcoaz #3fd0c9 doar pe butonul principal și indicatori (fără mov sau indigo)',
    hero: 'left column: titlu mare, subtitlu, 2 butoane, iar dreapta poza principală într-un card cu radius 24px și etichete mono plutitoare (ex. „Garanție”, „Programări azi”)',
    headline: 'efect de scramble scurt pe titlu (sub 1s), apoi rămâne fix',
    nav: 'nav cu linii-ghid verticale 1px rgba(255,255,255,.1) la marginile containerului, linkuri mono mici',
    signature: 'grilă bento întunecată (span 7/5/5/7) cu carduri care se luminează subtil sub cursor (radial-gradient ce urmărește mouse-ul, doar pe desktop)',
    sections: 'servicii în bento; statistici cu count-up 1.5s; proces în pași cu indici mono',
  },
  {
    id: 'sunlit-magazine', name: 'Revistă luminoasă', groups: ['hospitality', 'beauty', 'food'],
    mood: 'însorit, elegant, de vacanță',
    fonts: 'Cormorant Garamond italic pentru titluri mari (line-height .85) + Outfit 300–500 pentru text',
    palette: 'fundal #fffaf2, text #1a1a1a, gri #7c7468, accent albastru adânc #1f5f8b',
    hero: 'titlu uriaș în serif italic pe două rânduri, cu poza principală într-o fereastră arcuită (border-radius 999px 999px 0 0) suprapusă peste al doilea rând; text mic de revistă în colțuri (nr. ediție, oraș)',
    headline: 'litere care apar pe rând, 30ms între ele',
    nav: 'nav centrat cu logo-text în mijloc și linkurile despărțite stânga/dreapta, separate prin puncte •',
    signature: 'layout de revistă: coloane de text cu literă inițială mare (drop cap) în secțiunea despre și legende mici sub poze',
    sections: 'galerie orizontală cu scroll-snap; camere/servicii în carduri înalte 3/4; recenzii ca pull-quotes',
  },
  {
    id: 'craft-workshop', name: 'Atelier meșteșugăresc', groups: ['trades', 'auto', 'food'],
    mood: 'solid, meșteșugăresc, sincer',
    fonts: 'Barlow Condensed 600–800 uppercase pentru titluri (line-height .9) + Barlow 400 pentru text',
    palette: 'fundal verde-gri închis #1c1f1d, text #e9e4d8, gri #9a958a, carduri #252925, accent cupru #d08a4a',
    hero: 'inset-frame cu poza principală, titlu din majuscule condensate pe 3 rânduri stivuite jos-stânga, iar dreapta-jos un cerc cu „Garanție” sau anii de experiență (doar dacă sunt cunoscuți)',
    headline: 'rândurile stivuite apar unul după altul de jos în sus, 0.12s între ele',
    nav: 'nav cu fundal opac închis, butonul principal cupru cu săgeată într-un cerc care se rotește −45° la hover',
    signature: 'proces de lucru numerotat mare („01 —— Evaluare”, „02 —— Lucru”, „03 —— Predare”) cu linie de 64×1.5px',
    sections: 'lucrări realizate în galerie cu înainte/după dacă există poze potrivite; zone deservite ca listă de pastile; contact cu buton mare de sunat',
  },
]

export const CRAFT_RULES = `DESIGN DE NIVEL GALERIE (obligatoriu, nu un șablon):
- Primul ecran are O singură idee: logo + nav + un titlu + un subtitlu + 1–2 butoane + o poză/zonă vizuală, plus cel mult o bandă discretă (rating, statistici). Fără grile de carduri în primul ecran.
- Tipografie: cel mult 2 familii Google Fonts (+ opțional un mono pentru etichete), încărcate cu preconnect și display=swap, doar greutățile folosite. Titlul H1 cu clamp(): 36–48px pe mobil, 72–96px pe desktop, line-height 0.9–1.05, tracking −0.02…−0.05em, weight 400–500 (niciodată bold gros). Text 15–18px, line-height 1.5–1.6. Etichete 10–13px uppercase cu +0.15…0.3em. Titlurile rupte manual pe 2–3 rânduri.
- Culoare: 1 fundal, 1 culoare de text, 1–2 griuri și cel mult 1 accent, folosit pe maximum 3 tipuri de elemente. Ierarhia vine din opacitate, nu din culori noi. Fără gradiente mov/indigo, bule luminoase sau umbre grele. Prima regulă CSS setează fundalul pe html, body. Culoarea de selecție a textului e personalizată.
- Componente: un singur „material” reutilizat (de exemplu sticlă sau hârtie). Butoanele sunt pastile (cu excepția stilurilor tehnice, radius 6–7px), cel principal plin și invers față de fundal. Iconițe doar SVG inline, niciodată emoji. Radii consecvente.
- Mișcare: apariții în ordinea nav → eticheta → titlu → subtitlu → butoane, 0.1–0.2s între ele, totul gata în ~1.5s, cu cubic-bezier(0.22,1,0.36,1). Apariții la scroll o singură dată (prag 15%, translateY 24px, 0.7s). Hover mic (scale ≤1.05). Fără animații infinite, pulsări sau bule plutitoare. Ramură prefers-reduced-motion. STAREA DE BAZĂ E VIZIBILĂ: dacă JavaScript nu rulează, tot conținutul se vede (animațiile doar îl aduc, nu îl ascund permanent).
- Text: titlul are 3–9 cuvinte, specific afacerii, cu un punct de vedere, nu generic; subtitlul are 15–30 de cuvinte, cu un beneficiu concret. Butoane de 2–3 cuvinte care încep cu un verb. Fără lorem ipsum, „Serviciul 1/2/3” sau texte de umplutură.
- Fără probleme: fără scroll orizontal (overflow-x: clip pe root), 100dvh pentru hero pe mobil, raporturi de aspect rezervate pentru poze (fără salturi de layout), meniul de pe mobil blochează scroll-ul paginii și se închide la click pe link sau Esc, efectele de hover doar pe dispozitive cu hover.
- Structura secțiunilor e aleasă pentru afacerea asta (nu ordinea standard hero → servicii → despre → recenzii → contact de fiecare dată). Fiecare secțiune are o idee clară; mai puține secțiuni puternice sunt mai bune decât multe slabe.`

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
