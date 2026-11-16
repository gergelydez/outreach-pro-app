// Mesajele de WhatsApp (UK în engleză, Ungaria în maghiară, România în română), scurte și pe bucăți:
//  1) salut + ce am observat + „v-am pregătit gratuit un concept”
//  2) de ce merită + preț de pornire spus transparent + „Vreți să vi-l trimit?”
//  3) linkul demo-ului doar după ce răspunde „da”   4) reamintire după 2–3 zile
// Se pot edita în pagină; se salvează pe telefon (localStorage), separat pentru fiecare țară.
import type { Country } from './countries'

export interface UkTemplates {
  me: string
  intro_nosite: string
  intro_social: string
  intro_site: string
  offer: string        // partea 2 pentru firmele fără site (sau doar Facebook)
  offer_site: string   // partea 2 pentru firmele care au site, dar slab: refacerea lui
  price: string
  demo: string
  followup: string    // reamintire scurtă, pentru cei care n-au răspuns în 2–3 zile
}

const UK: UkTemplates = {
  me: 'Geri',
  intro_nosite: "Hi, I'm {me} 👋 I came across {name} on Google and noticed that, unlike other businesses in your area, you don't have a website, so I've put together a free website concept for you.",
  intro_social: "Hi, I'm {me} 👋 I came across {name} on Google and noticed you only have a Facebook/Instagram page, not your own website, so I've put together a free website concept for you.",
  intro_site: "Hi, I'm {me} 👋 I came across {name} on Google and had a look at your website: I noticed {problem}. So I've put together a free concept for a new, modern version.",
  offer: "A modern, well-built website can bring you a lot more customers, people who are currently going to your competitors. This month I'm building websites below market price to help local businesses grow.\n\nTo be transparent from the start: prices start from £200, but the concept I've already made is free. Shall I send it over?",
  offer_site: "A modern website, fast, great on mobile and optimised for Google, can bring you a lot more customers than your current one. This month I'm building websites below market price to help local businesses grow.\n\nTo be transparent from the start: prices start from £200, but the concept I've already made is free. Shall I send it over?",
  price: "To be transparent: prices start from £200, and the concept I've already made is free, with no obligation.",
  demo: "Here's the concept I made for {name}: {link}\nHave a look on your phone and let me know what you think 🙂 If you like it, I can put it live from £200.",
  followup: "Just following up 🙂 The free website concept for {name} is ready whenever you want it. Shall I send it over? Prices from £200 are valid until the end of the month.",
}

const HU: UkTemplates = {
  me: 'Geri',
  intro_nosite: "Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és láttam, hogy a környékbeli cégekkel ellentétben Önöknek nincs weboldaluk, ezért készítettem Önöknek ingyen egy weboldaltervet.",
  intro_social: "Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és láttam, hogy csak Facebook/Instagram oldaluk van, saját weboldaluk nincs, ezért készítettem Önöknek ingyen egy weboldaltervet.",
  intro_site: "Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és megnéztem a weboldalukat: azt vettem észre, hogy {problem}. Ezért készítettem Önöknek ingyen egy tervet egy új, modern weboldalra.",
  offer: "Egy modern, jól elkészített weboldal sokkal több ügyfelet hozhat, olyanokat, akik most a konkurenciához mennek. Ebben a hónapban piaci ár alatt készítem a weboldalakat, hogy segítsek a helyi vállalkozásoknak növekedni.\n\nHogy már az elején átlátható legyek: az árak 70 000 Ft-tól indulnak, de a már elkészült terv ingyenes. Elküldjem?",
  offer_site: "Egy modern weboldal, gyors, mobilon is szép és Google-re optimalizált, sokkal több ügyfelet hozhat, mint a mostani. Ebben a hónapban piaci ár alatt készítem a weboldalakat, hogy segítsek a helyi vállalkozásoknak növekedni.\n\nHogy már az elején átlátható legyek: az árak 70 000 Ft-tól indulnak, de a már elkészült terv ingyenes. Elküldjem?",
  price: "Hogy átlátható legyek: az árak 70 000 Ft-tól indulnak, a már elkészült terv pedig ingyenes és semmire sem kötelez.",
  demo: "Itt is van a terv, amit a(z) {name} számára készítettem: {link}\nNézze meg telefonon, és írja meg, mit gondol 🙂 Ha tetszik, 70 000 Ft-tól élesítem.",
  followup: "Csak röviden visszatérnék 🙂 A(z) {name} számára készített ingyenes weboldalterv továbbra is várja Önöket. Elküldjem? A 70 000 Ft-tól induló árak a hónap végéig érvényesek.",
}

const RO: UkTemplates = {
  me: 'Geri',
  intro_nosite: "Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și am observat că, spre deosebire de alte firme din zonă, nu aveți un site, așa că v-am pregătit gratuit un concept de site.",
  intro_social: "Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și am observat că aveți doar pagină de Facebook/Instagram, nu un site propriu, așa că v-am pregătit gratuit un concept de site.",
  intro_site: "Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și m-am uitat pe site-ul dumneavoastră: am observat că {problem}. Așa că v-am pregătit gratuit un concept pentru un site nou, modern.",
  offer: "Un site modern, făcut cum trebuie, vă poate aduce mult mai mulți clienți, oameni care acum ajung la concurență. Luna aceasta fac site-urile sub prețul pieței, ca să ajut firmele locale să crească.\n\nCa să fiu transparent de la început: prețurile pornesc de la 700 de lei, dar conceptul realizat deja e gratuit. Vreți să vi-l trimit?",
  offer_site: "Un site modern, rapid, arătos pe telefon și optimizat pentru Google, vă poate aduce mult mai mulți clienți decât cel de acum. Luna aceasta fac site-urile sub prețul pieței, ca să ajut firmele locale să crească.\n\nCa să fiu transparent de la început: prețurile pornesc de la 700 de lei, dar conceptul realizat deja e gratuit. Vreți să vi-l trimit?",
  price: "Ca să fiu transparent: prețurile pornesc de la 700 de lei, iar conceptul realizat deja e gratuit și nu vă obligă la nimic.",
  demo: "Iată conceptul făcut pentru {name}: {link}\nUitați-vă pe telefon și spuneți-mi ce părere aveți 🙂 Dacă vă place, îl pun online de la 700 lei.",
  followup: "Revin pe scurt 🙂 Conceptul de site pregătit pentru {name} vă așteaptă, e gratuit. Vreți să vi-l trimit? Prețurile de la 700 lei sunt valabile până la sfârșitul lunii.",
}

export const DEFAULT_TEMPLATES: UkTemplates = UK
export const TEMPLATES: Record<Country, UkTemplates> = { UK, HU, RO }

// Problema principală, formulată scurt pentru mesaj (din codul constatării de la audit)
const PROBLEM: Record<Country, Record<string, string>> = {
  UK: {
    broken: "it isn't loading at the moment",
    no_https: 'it shows as “Not secure” in Chrome',
    not_mobile_friendly: "it isn't set up for phones, so the text is tiny on mobile",
    mobile_overflow: 'it doesn’t fit properly on a phone screen',
    slow_mobile: 'it loads quite slowly on mobile',
    outdated_signal: 'it looks a bit dated',
    free_subdomain: "it's on a free website-builder address",
    no_contact_form: "there's no easy way to ask for a quote",
    no_cta: "there's no clear “get a quote” or “call now” button",
    no_click_to_call: "the phone number isn't tappable on mobile",
    no_local_signals: "it doesn't mention the areas you cover",
    no_meta_description: "it doesn't show a proper description on Google",
    weak_title: "the page title doesn't say what you do and where",
    no_service_pages: "your services aren't listed on their own pages",
  },
  HU: {
    broken: 'jelenleg nem töltődik be',
    no_https: 'a Chrome „Nem biztonságos” jelzést mutat mellette',
    not_mobile_friendly: 'nincs mobilra optimalizálva, így telefonon apró a szöveg',
    mobile_overflow: 'telefonon nem fér ki rendesen a képernyőre',
    slow_mobile: 'mobilon elég lassan töltődik be',
    outdated_signal: 'kicsit elavultnak tűnik',
    free_subdomain: 'ingyenes oldalépítő címen fut',
    no_contact_form: 'nincs rajta egyszerű ajánlatkérő űrlap',
    no_cta: 'nincs rajta jól látható „Ajánlatkérés” vagy „Hívjon most” gomb',
    no_click_to_call: 'a telefonszám mobilon nem kattintható',
    no_local_signals: 'nem írja, mely környéken dolgoznak',
    no_meta_description: 'a Google-ben nem jelenik meg rendes leírás',
    weak_title: 'az oldal címe nem mondja meg, mivel és hol foglalkoznak',
    no_service_pages: 'a szolgáltatások nincsenek külön oldalakon',
  },
  RO: {
    broken: 'momentan nu se deschide',
    no_https: 'Chrome afișează „Nesigur” lângă adresă',
    not_mobile_friendly: 'nu e adaptat pentru telefon, așa că textul e foarte mic pe mobil',
    mobile_overflow: 'pe telefon nu încape bine pe ecran',
    slow_mobile: 'se încarcă destul de greu pe telefon',
    outdated_signal: 'arată cam vechi',
    free_subdomain: 'e pe o adresă gratuită de tip platformă',
    no_contact_form: 'nu are un formular simplu de cerere ofertă',
    no_cta: 'nu are un buton clar de tip „Cere ofertă” sau „Sună acum”',
    no_click_to_call: 'numărul de telefon nu se poate apăsa pe mobil',
    no_local_signals: 'nu scrie în ce zonă lucrați',
    no_meta_description: 'nu apare o descriere bună în Google',
    weak_title: 'titlul paginii nu spune ce faceți și unde',
    no_service_pages: 'serviciile nu sunt prezentate pe pagini separate',
  },
}
const FALLBACK: Record<Country, string> = { UK: 'it could do with a refresh', HU: 'ráférne egy frissítés', RO: 'i-ar prinde bine o reîmprospătare' }
// ordinea contează: întâi ce vede imediat un client
const PRIORITY = ['broken', 'not_mobile_friendly', 'no_https', 'outdated_signal', 'mobile_overflow', 'slow_mobile', 'free_subdomain', 'no_contact_form', 'no_cta', 'no_click_to_call', 'no_local_signals', 'weak_title', 'no_meta_description', 'no_service_pages']

// Cele mai importante 1–2 probleme, legate natural („… and …” / „… és …”)
export function mainProblem(codes: string[], country: Country = 'UK', max = 2): string {
  const picked = PRIORITY.filter(p => codes.includes(p)).slice(0, max).map(c => PROBLEM[country][c])
  if (!picked.length) return FALLBACK[country]
  return picked.join(country === 'HU' ? ', és ' : country === 'RO' ? ' și ' : ' and ')
}

export function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m))
}

const NO_OWN_SITE = ['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY']

export function buildMessages(t: UkTemplates, lead: { name: string; trades: string; website_status: string; findingCodes: string[]; previewUrl?: string | null; country?: Country }) {
  const country = lead.country || 'UK'
  const vars = { me: t.me || 'Geri', name: lead.name, trades: lead.trades, problem: mainProblem(lead.findingCodes, country), link: lead.previewUrl || '[link]' }
  const intro = lead.website_status === 'NO_WEBSITE' ? t.intro_nosite
    : ['SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(lead.website_status) ? t.intro_social
    : t.intro_site
  // partea 2: cine n-are site primește oferta de site propriu; cine are site slab, refacerea lui
  const offer = NO_OWN_SITE.includes(lead.website_status) ? t.offer : (t.offer_site || t.offer)
  return { first: fill(intro, vars), second: fill(offer, vars), price: fill(t.price, vars), demo: fill(t.demo, vars), followup: fill(t.followup || '', vars) }
}

// Ce fel de lead merită un demo: orice în afară de un site deja bun
export const DEMO_STATUSES = ['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY', 'FREE_SUBDOMAIN', 'BROKEN_WEBSITE', 'OUTDATED_WEBSITE', 'NEEDS_REDESIGN']
