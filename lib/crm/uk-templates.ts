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
}

export const DEFAULT_TEMPLATES: UkTemplates = UK
export const TEMPLATES: Record<Country, UkTemplates> = { UK, HU }

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
}
const FALLBACK: Record<Country, string> = { UK: 'it could do with a refresh', HU: 'ráférne egy frissítés' }
// ordinea contează: întâi ce vede imediat un client
const PRIORITY = ['broken', 'not_mobile_friendly', 'no_https', 'outdated_signal', 'mobile_overflow', 'slow_mobile', 'free_subdomain', 'no_contact_form', 'no_cta', 'no_click_to_call', 'no_local_signals', 'weak_title', 'no_meta_description', 'no_service_pages']

// Cele mai importante 1–2 probleme, legate natural („… and …” / „… és …”)
export function mainProblem(codes: string[], country: Country = 'UK', max = 2): string {
  const picked = PRIORITY.filter(p => codes.includes(p)).slice(0, max).map(c => PROBLEM[country][c])
  if (!picked.length) return FALLBACK[country]
  return picked.join(country === 'HU' ? ', és ' : ' and ')
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
  return { first: fill(intro, vars), second: fill(offer, vars), price: fill(t.price, vars), demo: fill(t.demo, vars) }
}

// Ce fel de lead merită un demo: orice în afară de un site deja bun
export const DEMO_STATUSES = ['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY', 'FREE_SUBDOMAIN', 'BROKEN_WEBSITE', 'OUTDATED_WEBSITE', 'NEEDS_REDESIGN']
