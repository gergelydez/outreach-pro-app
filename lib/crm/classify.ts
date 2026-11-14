// Clasificarea site-ului unei afaceri + constatările concrete (ce, de ce, ce de făcut,
// ce serviciu). Totul pornește de la fapte observate de worker — fără presupuneri.
import type { AuditFacts, Finding } from './audit-types'
import type { WebsiteStatus } from './constants'
import { normalizeDomain } from './normalize'

const SOCIAL = ['facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'linktr.ee']
const DIRECTORIES = ['checkatrade.com', 'yell.com', 'mybuilder.com', 'trustatrader.com', 'ratedpeople.com', 'bark.com', 'yelp.co.uk', 'yelp.com',
  'thomsonlocal.com', 'freeindex.co.uk', 'cylex-uk.co.uk', 'scoot.co.uk', 'hotfrog.co.uk', 'nextdoor.co.uk', 'nextdoor.com', 'which.co.uk', 'houzz.co.uk', 'google.com', 'g.page']
const FREE_HOSTS = ['wixsite.com', 'business.site', 'wordpress.com', 'godaddysites.com', 'square.site', 'webflow.io', 'carrd.co', 'weebly.com',
  'jimdosite.com', 'sites.google.com', 'site123.me', 'mystrikingly.com', 'blogspot.com', 'netlify.app', 'vercel.app', 'yolasite.com', 'ueniweb.com', 'webador.co.uk']

const onDomain = (domain: string, list: string[]) => list.some(d => domain === d || domain.endsWith('.' + d))

export type UrlKind = 'social' | 'directory' | 'free_subdomain' | 'own_domain'
export function urlKind(url: string): UrlKind {
  const d = normalizeDomain(url) || ''
  const full = url.toLowerCase()
  if (onDomain(d, SOCIAL)) return 'social'
  if (onDomain(d, DIRECTORIES)) return 'directory'
  if (onDomain(d, FREE_HOSTS) || full.includes('sites.google.com')) return 'free_subdomain'
  return 'own_domain'
}

// Un eșec temporar nu înseamnă site stricat: cerem două eșecuri la cel puțin 6 ore distanță
export const BROKEN_CONFIRM_HOURS = 6

export interface ClassifyInput {
  websiteUrl: string | null
  facts: AuditFacts | null
  previousFailureAt?: Date | null
  now?: Date
  city?: string | null
}
export interface ClassifyResult {
  status: WebsiteStatus
  findings: Finding[]
  evidence: string[]
  needsRecheck: boolean
}

export function outdatedEvidence(f: AuditFacts, now: Date): string[] {
  const ev: string[] = []
  if (f.has_viewport === false) ev.push('No mobile viewport meta tag (page is not set up for phones)')
  if (f.old_tech?.length) ev.push(`Legacy technology detected: ${f.old_tech.join(', ')}`)
  if (f.copyright_year && f.copyright_year <= now.getFullYear() - 4) ev.push(`Copyright notice still shows ${f.copyright_year}`)
  if (f.table_layout) ev.push('Page layout built with HTML tables')
  return ev
}

export function buildFindings(f: AuditFacts, city?: string | null, now: Date = new Date()): Finding[] {
  const out: Finding[] = []
  const add = (x: Finding) => out.push(x)
  if (f.https === false) add({ code: 'no_https', severity: 'high', what: 'The website is served without HTTPS.', why: 'Browsers label the page "Not secure", which puts visitors off before they call or request a quote.', fix: 'Install an SSL certificate and redirect all traffic to HTTPS.', service: 'Website maintenance' })
  if (f.has_viewport === false) add({ code: 'not_mobile_friendly', severity: 'high', what: 'No mobile viewport tag — the page renders as a shrunken desktop page on phones.', why: 'Most local searches happen on a phone; visitors have to pinch and zoom to read or tap the number.', fix: 'Rebuild with a responsive, mobile-first layout.', service: 'Website redesign' })
  if (f.mobile?.horizontal_overflow) add({ code: 'mobile_overflow', severity: 'medium', what: 'On a 390px phone screen the page scrolls sideways.', why: 'Content cut off at the edge looks broken and hides buttons.', fix: 'Fix the layout so it fits narrow screens.', service: 'Mobile website optimisation' })
  const perf = f.pagespeed?.fetched ? f.pagespeed.performance : null
  if (perf != null && perf < 50) add({ code: 'slow_mobile', severity: perf < 30 ? 'high' : 'medium', what: `Google PageSpeed mobile performance score is ${perf}/100${f.pagespeed?.lcp_ms ? ` (largest content appears after ${(f.pagespeed.lcp_ms / 1000).toFixed(1)}s)` : ''}.`, why: 'Slow pages lose visitors before they see the phone number, especially on mobile data.', fix: 'Compress images, remove unused scripts and use modern hosting.', service: 'Website speed optimisation', evidence: 'Google PageSpeed Insights (mobile)' })
  if (f.reachable && f.contact_form === false) add({ code: 'no_contact_form', severity: 'medium', what: 'No contact or quote request form was found on the page.', why: 'Customers who cannot call during working hours have no easy way to leave an enquiry.', fix: 'Add a short quote request form (name, phone, job details).', service: 'Conversion optimisation' })
  if (f.reachable && f.has_cta === false) add({ code: 'no_cta', severity: 'medium', what: 'No clear call to action (e.g. "Get a quote", "Call now") was found.', why: 'Visitors are not guided towards contacting the business.', fix: 'Add a prominent call/quote button above the fold and repeat it on the page.', service: 'Conversion optimisation' })
  if (f.reachable && (f.tel_links ?? 0) === 0) add({ code: 'no_click_to_call', severity: 'medium', what: 'The phone number is not a tap-to-call link.', why: 'Mobile visitors must copy the number manually instead of calling with one tap.', fix: 'Make every phone number a tel: link and add a sticky call button on mobile.', service: 'Mobile website optimisation' })
  if (f.reachable && !f.meta_description) add({ code: 'no_meta_description', severity: 'low', what: 'The page has no meta description.', why: 'Google shows a random snippet in search results instead of a clear summary of services.', fix: 'Write a description with the main service and area covered.', service: 'Local SEO' })
  if (f.reachable && (!f.title || f.title.trim().length < 10)) add({ code: 'weak_title', severity: 'low', what: `The page title is ${f.title ? `"${f.title}"` : 'missing'}.`, why: 'The title is the headline in Google results; a weak one gets fewer clicks.', fix: 'Use a title like "Service in City | Business Name".', service: 'Local SEO' })
  if (f.reachable && f.local_seo && !f.local_seo.mentions_city && city) add({ code: 'no_local_signals', severity: 'low', what: `The page does not mention ${city}.`, why: 'Google matches local searches like "plumber in ' + city + '" using the area named on the page.', fix: `Name the areas covered (${city} and surrounding towns) and add the address.`, service: 'Local SEO' })
  if (f.reachable && (f.service_links ?? 0) === 0 && (f.nav_links ?? 0) <= 2) add({ code: 'no_service_pages', severity: 'low', what: 'No separate service pages were found in the navigation.', why: 'Separate pages per service help both customers and Google understand what is offered.', fix: 'Add a page per main service with photos and FAQs.', service: 'Website redesign' })
  for (const ev of outdatedEvidence(f, now)) {
    if (ev.startsWith('No mobile viewport')) continue
    add({ code: 'outdated_signal', severity: 'medium', what: ev + '.', why: 'Signals the site has not been maintained, which can reduce trust.', fix: 'Modernise the site and keep it maintained.', service: 'Website redesign' })
  }
  return out
}

export function classifyWebsite(input: ClassifyInput): ClassifyResult {
  const now = input.now || new Date()
  const f = input.facts
  const url = input.websiteUrl

  if (!url) {
    if (f?.presence?.checked && !f.presence.found_url) {
      return { status: 'NO_WEBSITE', findings: [{ code: 'no_website', severity: 'high', what: 'No website is listed on the Google profile and none was found on the likely domains checked.', why: 'Customers comparing local trades cannot see services, photos or reviews outside Google.', fix: 'Launch a simple, fast website with services, areas covered and a quote form.', service: 'Professional website development', evidence: `Domains checked: ${f.presence.candidates.join(', ') || '—'}` }], evidence: [`Google profile has no website`, `Likely domains checked: ${f.presence.candidates.join(', ')}`], needsRecheck: false }
    }
    return { status: 'UNVERIFIED', findings: [], evidence: ['No website on the Google profile; additional verification pending'], needsRecheck: false }
  }

  const kind = urlKind(url)
  if (kind === 'social') return { status: 'SOCIAL_ONLY', findings: [{ code: 'social_only', severity: 'high', what: `The only web presence listed is a social profile (${normalizeDomain(url)}).`, why: 'Social pages are hard to find in Google searches and do not show services or a quote form clearly.', fix: 'Add a proper website and link it from the social profile.', service: 'Professional website development', evidence: url }], evidence: [url], needsRecheck: false }
  if (kind === 'directory') return { status: 'DIRECTORY_ONLY', findings: [{ code: 'directory_only', severity: 'high', what: `The listed website is a directory page (${normalizeDomain(url)}), not the business's own site.`, why: 'Directory pages show competitors next to the business and the business does not control them.', fix: 'Launch an own-domain website and keep the directory profile as an extra channel.', service: 'Professional website development', evidence: url }], evidence: [url], needsRecheck: false }

  if (!f) return { status: 'UNVERIFIED', findings: [], evidence: ['Website not audited yet'], needsRecheck: false }

  if (!f.reachable) {
    const transient = f.error_kind === 'timeout' || f.error_kind === 'blocked' || f.error_kind === 'connection' || (f.http_status != null && f.http_status >= 500)
    const confirmed = input.previousFailureAt && now.getTime() - input.previousFailureAt.getTime() >= BROKEN_CONFIRM_HOURS * 3600_000
    const hardFail = f.error_kind === 'dns' || f.error_kind === 'ssl' || f.http_status === 404 || f.http_status === 410
    if (f.error_kind === 'blocked' || f.error_kind === 'unsafe_target') {
      return { status: 'UNVERIFIED', findings: [], evidence: [`Site could not be checked (${f.error_kind})`], needsRecheck: false }
    }
    if (confirmed && (hardFail || transient)) {
      return { status: 'BROKEN_WEBSITE', findings: [{ code: 'broken', severity: 'high', what: `The website did not load on two checks at least ${BROKEN_CONFIRM_HOURS} hours apart (${f.error_kind || `HTTP ${f.http_status}`}).`, why: 'Anyone who clicks the website link from Google sees an error and is likely to call a competitor.', fix: 'Restore or rebuild the website and check the domain and hosting renewal.', service: 'Professional website development', evidence: f.checked_url || url }], evidence: [`Failed: ${f.error_kind || f.http_status}`], needsRecheck: false }
    }
    return { status: 'UNVERIFIED', findings: [], evidence: [`First failed check (${f.error_kind || `HTTP ${f.http_status}`}); rechecking later before calling it broken`], needsRecheck: true }
  }

  const findings = buildFindings(f, input.city, now)
  if (kind === 'free_subdomain') {
    findings.unshift({ code: 'free_subdomain', severity: 'medium', what: `The website runs on a free builder subdomain (${normalizeDomain(url)}).`, why: 'A free subdomain looks less established and is harder to rank locally.', fix: 'Move to an own domain with a professional build.', service: 'Professional website development', evidence: url })
    return { status: 'FREE_SUBDOMAIN', findings, evidence: [url], needsRecheck: false }
  }

  const outdated = outdatedEvidence(f, now)
  if (f.has_viewport === false || outdated.length >= 2) return { status: 'OUTDATED_WEBSITE', findings, evidence: outdated, needsRecheck: false }

  const conversion = findings.filter(x => ['slow_mobile', 'mobile_overflow', 'no_contact_form', 'no_cta', 'no_click_to_call', 'no_https'].includes(x.code))
  if (conversion.length >= 3) return { status: 'NEEDS_REDESIGN', findings, evidence: conversion.map(c => c.what), needsRecheck: false }
  return { status: 'GOOD_WEBSITE', findings, evidence: findings.length ? findings.map(c => c.what) : ['No significant issues detected'], needsRecheck: false }
}
