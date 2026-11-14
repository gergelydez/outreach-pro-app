// Scor de oportunitate 0–100, transparent: fiecare factor e salvat cu puncte,
// maxim, dacă a fost verificat și dovada. Datele neverificate nu primesc puncte.
//
// Normalizare: scor = puncte obținute / puncte maxime APLICABILE acestui tip de lead.
// O afacere fără site nu poate avea „site lent”, deci factorii de site nu intră la
// numitor; altfel o afacere fără site cu reputație bună n-ar putea trece de ~35.
import type { AuditFacts, ScoreFactor } from './audit-types'
import type { ScoringWeights } from './settings'
import { opportunityLabel } from './constants'

export interface ScoreInput {
  websiteStatus: string
  facts: AuditFacts | null
  rating: number | null
  reviewCount: number | null
  weights: ScoringWeights
}
export interface ScoreResult { score: number; label: string; labelKey: string; factors: ScoreFactor[] }

export function scoreLead(i: ScoreInput): ScoreResult {
  const w = i.weights
  const f = i.facts
  const factors: ScoreFactor[] = []
  const presenceMax = Math.max(w.no_website, w.social_only, w.directory_or_free, w.broken_website, w.outdated_website, w.needs_redesign)

  // 1. Prezența online — un singur factor (cel mai puternic), ca să nu adunăm de două ori
  const presenceMap: Record<string, [number, string]> = {
    NO_WEBSITE: [w.no_website, 'No verified website'],
    SOCIAL_ONLY: [w.social_only, 'Social media only'],
    DIRECTORY_ONLY: [w.directory_or_free, 'Directory listing only'],
    FREE_SUBDOMAIN: [w.directory_or_free, 'Free builder subdomain'],
    BROKEN_WEBSITE: [w.broken_website, 'Broken website (confirmed twice)'],
    OUTDATED_WEBSITE: [w.outdated_website, 'Clearly outdated website'],
    NEEDS_REDESIGN: [w.needs_redesign, 'Website needs redesign'],
    GOOD_WEBSITE: [0, 'Website in good shape'],
  }
  const [presencePts, presenceLabel] = presenceMap[i.websiteStatus] || [0, 'Website status unverified']
  factors.push({ key: 'presence', label: presenceLabel, points: presencePts, max: presenceMax, verified: i.websiteStatus !== 'UNVERIFIED', evidence: i.websiteStatus })

  // 2. Factori de site — doar dacă site-ul propriu a putut fi auditat
  const siteAudited = !!f?.reachable && ['OUTDATED_WEBSITE', 'NEEDS_REDESIGN', 'GOOD_WEBSITE', 'FREE_SUBDOMAIN'].includes(i.websiteStatus)
  if (siteAudited && f) {
    const noViewport = f.has_viewport === false
    const overflow = f.mobile?.horizontal_overflow === true
    // dacă lipsa viewport-ului a dus deja la „outdated”, mobilul contează doar pe jumătate
    const mobilePts = (noViewport || overflow) ? (noViewport && i.websiteStatus === 'OUTDATED_WEBSITE' ? Math.round(w.poor_mobile / 2) : w.poor_mobile) : 0
    factors.push({ key: 'poor_mobile', label: 'Poor mobile experience', points: mobilePts, max: w.poor_mobile, verified: f.has_viewport !== undefined || f.mobile?.horizontal_overflow != null, evidence: noViewport ? 'No viewport meta tag' : overflow ? 'Horizontal scroll at 390px' : 'Mobile layout OK' })

    const ps = f.pagespeed
    const perf = ps?.fetched ? ps.performance : null
    // plafon comun mobil + viteză (implicit 10 + 10 → max 15), ca aceeași problemă să nu fie numărată de două ori
    const speedPts = perf != null && perf < 50 ? Math.min(w.poor_pagespeed, Math.max(0, w.poor_mobile + w.poor_pagespeed - 5 - mobilePts)) : 0
    factors.push({ key: 'poor_pagespeed', label: 'Poor PageSpeed performance', points: speedPts, max: w.poor_pagespeed, verified: perf != null, evidence: perf != null ? `Mobile performance ${perf}/100` : 'PageSpeed not measured' })

    factors.push({ key: 'missing_contact_form', label: 'Missing contact form', points: f.contact_form === false ? w.missing_contact_form : 0, max: w.missing_contact_form, verified: f.contact_form !== undefined, evidence: f.contact_form ? 'Form found' : 'No form found' })
    factors.push({ key: 'missing_cta', label: 'Missing clear call to action', points: f.has_cta === false ? w.missing_cta : 0, max: w.missing_cta, verified: f.has_cta !== undefined, evidence: f.cta_texts?.length ? `CTAs: ${f.cta_texts.slice(0, 3).join(', ')}` : 'No CTA text found' })
    const waFound = (f.whatsapp_links?.length || 0) > 0 || f.whatsapp_widget
    factors.push({ key: 'no_whatsapp_link', label: 'No WhatsApp link detected', points: waFound ? 0 : w.no_whatsapp_link, max: w.no_whatsapp_link, verified: true, evidence: waFound ? 'WhatsApp link found' : 'No public WhatsApp link on the page' })
  }

  // 3. Reputație — afaceri care au clienți (și deci buget)
  const reviews = i.reviewCount
  factors.push({ key: 'established_reviews', label: 'Established review presence', points: reviews != null && reviews >= 20 ? w.established_reviews : 0, max: w.established_reviews, verified: reviews != null, evidence: reviews != null ? `${reviews} Google reviews` : 'Review count unknown' })
  factors.push({ key: 'strong_reputation', label: 'Strong local reputation', points: i.rating != null && reviews != null && i.rating >= 4.5 && reviews >= 10 ? w.strong_reputation : 0, max: w.strong_reputation, verified: i.rating != null, evidence: i.rating != null ? `Rating ${i.rating}★` : 'Rating unknown' })

  const got = factors.reduce((s, x) => s + (x.verified ? x.points : 0), 0)
  const max = factors.reduce((s, x) => s + x.max, 0)
  const score = max > 0 ? Math.max(0, Math.min(100, Math.round((got / max) * 100))) : 0
  const l = opportunityLabel(score)
  return { score, label: l.label, labelKey: l.key, factors }
}
