// Mesajele de WhatsApp pentru UK (în engleză), scurte și pe bucăți, ca să fie citite:
//  1) salut + ce am observat   2) oferta de concept gratuit + cine sunt
//  3) doar dacă răspunde interesat: prețul   4) după demo: linkul
// Se pot edita în pagină; se salvează pe telefon (localStorage).

export interface UkTemplates {
  me: string
  intro_nosite: string
  intro_social: string
  intro_site: string
  offer: string
  price: string
  demo: string
}

export const DEFAULT_TEMPLATES: UkTemplates = {
  me: 'Geri',
  intro_nosite: "Hi, I'm {me} 👋 I came across {name} on Google and noticed that, unlike other {trades} nearby, you don't have a website.",
  intro_social: "Hi, I'm {me} 👋 I came across {name} on Google and noticed you only have a social media or directory page, not a website of your own.",
  intro_site: "Hi, I'm {me} 👋 I came across {name} on Google and had a look at your website – I noticed {problem}.",
  offer: "If you're interested, I can make a free concept of your own website so you can see how it would look. If you like it, I'll personalise it and put it live.\n\nI'm not an agency or a freelancer – I'm a university student and I need real businesses to build sites for as part of a project. If it's not for you, no worries, just let me know.",
  price: "Just to be upfront: the concept is free and there's no obligation. If you'd like it live afterwards, it would be around £200–300 – much less than an agency would charge.",
  demo: "Here's the concept I made for {name}: {link}\nHave a look on your phone and let me know what you think 🙂",
}

// Problema principală, formulată scurt pentru mesaj (din codul constatării de la audit)
const PROBLEM_EN: Record<string, string> = {
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
}
// ordinea contează: întâi ce vede imediat un client
const PRIORITY = ['broken', 'not_mobile_friendly', 'no_https', 'outdated_signal', 'mobile_overflow', 'slow_mobile', 'free_subdomain', 'no_contact_form', 'no_cta', 'no_click_to_call', 'no_local_signals', 'weak_title', 'no_meta_description', 'no_service_pages']

export function mainProblem(codes: string[]): string {
  const c = PRIORITY.find(p => codes.includes(p))
  return c ? PROBLEM_EN[c] : 'it could do with a refresh'
}

export function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m))
}

export function buildMessages(t: UkTemplates, lead: { name: string; trades: string; website_status: string; findingCodes: string[]; previewUrl?: string | null }) {
  const vars = { me: t.me || 'Geri', name: lead.name, trades: lead.trades, problem: mainProblem(lead.findingCodes), link: lead.previewUrl || '[link]' }
  const intro = lead.website_status === 'NO_WEBSITE' ? t.intro_nosite
    : ['SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(lead.website_status) ? t.intro_social
    : t.intro_site
  return { first: fill(intro, vars), second: fill(t.offer, vars), price: fill(t.price, vars), demo: fill(t.demo, vars) }
}

// Ce fel de lead merită un demo: orice în afară de un site deja bun
export const DEMO_STATUSES = ['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY', 'FREE_SUBDOMAIN', 'BROKEN_WEBSITE', 'OUTDATED_WEBSITE', 'NEEDS_REDESIGN']
