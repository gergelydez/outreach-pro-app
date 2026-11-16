// Mesajele de WhatsApp (UK în engleză, Ungaria în maghiară), scurte și pe bucăți, ca să fie citite:
//  1) salut + ce am observat
//  2) oferta: fără site → concept gratuit de site propriu; cu site → variantă modernă, optimizată, a site-ului lor
//  3) doar dacă răspunde interesat: prețul   4) după demo: linkul
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
  intro_nosite: "Hi, I'm {me} 👋 I came across {name} on Google and noticed that, unlike other {trades} nearby, you don't have a website.",
  intro_social: "Hi, I'm {me} 👋 I came across {name} on Google and noticed you only have a social media or directory page, not a website of your own.",
  intro_site: "Hi, I'm {me} 👋 I came across {name} on Google and had a look at your website – I noticed {problem}.",
  offer: "If you're interested, I can make a free concept of your own website so you can see how it would look. If you like it, I'll personalise it and put it live.\n\nI'm not an agency or a freelancer – I'm a university student and I need real businesses to build sites for as part of a project. If it's not for you, no worries, just let me know.",
  offer_site: "If you're interested, I can make you a free concept of a modern version of your website – fast, mobile-friendly and optimised for Google – so you can see how it would look. If you like it, I'll personalise it and put it live.\n\nI'm not an agency or a freelancer – I'm a university student and I need real businesses to build sites for as part of a project. If it's not for you, no worries, just let me know.",
  price: "Just to be upfront: the concept is free and there's no obligation. If you'd like it live afterwards, it would be around £200–300 – much less than an agency would charge.",
  demo: "Here's the concept I made for {name}: {link}\nHave a look on your phone and let me know what you think 🙂",
  followup: "Just following up on my message above 🙂 Happy to put together the free concept for {name} if you'd like to see how it would look. If now's not a good time, no worries at all.",
}

const HU: UkTemplates = {
  me: 'Geri',
  intro_nosite: 'Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és feltűnt, hogy a környékbeli konkurenciával ellentétben nincs saját weboldaluk.',
  intro_social: 'Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és láttam, hogy csak közösségi oldaluk van (pl. Facebook), saját weboldaluk nincs.',
  intro_site: 'Jó napot kívánok! {me} vagyok 👋 A Google-ön találtam rá a(z) {name} vállalkozásra, és megnéztem a weboldalukat – azt vettem észre, hogy {problem}.',
  offer: 'Ha érdekli, ingyen elkészítem a saját weboldaluk tervét, hogy lássa, hogyan nézne ki. Ha tetszik, személyre szabom és élesítem.\n\nNem ügynökség és nem szabadúszó vagyok – egyetemista vagyok, és egy projekthez valódi vállalkozásoknak készítek weboldalt. Ha nem érdekli, semmi gond, csak jelezze.',
  offer_site: 'Ha érdekli, ingyen elkészítem a mostani weboldaluk modern változatát – gyors, mobilbarát és Google-keresésre optimalizált –, hogy lássa, hogyan nézne ki. Ha tetszik, személyre szabom és élesítem.\n\nNem ügynökség és nem szabadúszó vagyok – egyetemista vagyok, és egy projekthez valódi vállalkozásoknak készítek weboldalt. Ha nem érdekli, semmi gond, csak jelezze.',
  price: 'Hogy őszinte legyek: a terv ingyenes és semmire sem kötelez. Ha utána szeretné élesíteni, az kb. 70 000–100 000 Ft lenne – jóval kevesebb, mint egy ügynökségnél.',
  demo: 'Itt a weboldal-terv, amit a(z) {name} számára készítettem: {link}\nNézze meg telefonon, és írja meg, mit gondol 🙂',
  followup: 'Csak röviden visszatérnék az előző üzenetemre 🙂 Szívesen elkészítem az ingyenes weboldal-tervet, ha kíváncsi rá, hogyan nézne ki. Ha most nem aktuális, semmi gond.',
}

const RO: UkTemplates = {
  me: 'Geri',
  intro_nosite: 'Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și am observat că, spre deosebire de alte firme din zonă, nu aveți un site.',
  intro_social: 'Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și am observat că aveți doar pagină de Facebook/Instagram, nu un site propriu.',
  intro_site: 'Bună ziua! Sunt {me} 👋 Am dat de {name} pe Google și m-am uitat pe site-ul dumneavoastră – am observat că {problem}.',
  offer: 'Dacă vă interesează, vă pot face gratuit un concept de site propriu, ca să vedeți cum ar arăta. Dacă vă place, îl personalizez și îl pun online.\n\nNu sunt agenție și nici freelancer – sunt student și am nevoie de afaceri reale pentru un proiect la facultate. Dacă nu vă interesează, nicio problemă, îmi spuneți și nu vă mai deranjez.',
  offer_site: 'Dacă vă interesează, vă pot face gratuit un concept al unei variante moderne a site-ului – rapid, arătos pe telefon și optimizat pentru Google – ca să vedeți cum ar arăta. Dacă vă place, îl personalizez și îl pun online.\n\nNu sunt agenție și nici freelancer – sunt student și am nevoie de afaceri reale pentru un proiect la facultate. Dacă nu vă interesează, nicio problemă, îmi spuneți și nu vă mai deranjez.',
  price: 'Ca să fiu sincer de la început: conceptul e gratuit și nu vă obligă la nimic. Dacă vreți apoi să-l puneți online, ar costa în jur de 700–1.400 lei – mult mai puțin decât la o agenție.',
  demo: 'Iată conceptul pe care l-am făcut pentru {name}: {link}\nUitați-vă pe telefon și spuneți-mi ce părere aveți 🙂',
  followup: 'Revin pe scurt la mesajul de mai sus 🙂 Vă pot face oricând conceptul gratuit pentru {name}, dacă vreți să vedeți cum ar arăta. Dacă nu e momentul potrivit, nicio problemă.',
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
