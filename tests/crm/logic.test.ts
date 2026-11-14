import { describe, it, expect } from 'vitest'
import { normalizeUkPhone, normalizeDomain, normalizeName, extractUkPostcode, ukPhoneType } from '@/lib/crm/normalize'
import { classifyWebsite, urlKind } from '@/lib/crm/classify'
import { scoreLead } from '@/lib/crm/scoring'
import { DEFAULT_SETTINGS } from '@/lib/crm/settings'
import { checkContact } from '@/lib/crm/compliance'
import { createSession, verifySession, checkPassword } from '@/lib/crm/session'
import { csvCell } from '@/lib/crm/csv'
import { buildLeadFilter } from '@/lib/crm/leads-query'
import type { AuditFacts } from '@/lib/crm/audit-types'

const W = DEFAULT_SETTINGS.scoring
const goodSite: AuditFacts = {
  reachable: true, https: true, has_viewport: true, title: 'Plumber in Birmingham | Acme Plumbing', meta_description: 'Emergency plumber',
  contact_form: true, has_cta: true, cta_texts: ['Get a quote'], tel_links: 2, whatsapp_links: [], local_seo: { mentions_city: true },
  service_links: 4, nav_links: 6, pagespeed: { fetched: true, performance: 85 }, mobile: { tested_with: 'playwright', horizontal_overflow: false },
}

describe('normalize', () => {
  it('normalises UK phone numbers to E.164', () => {
    expect(normalizeUkPhone('0121 496 0123')).toBe('+441214960123')
    expect(normalizeUkPhone('+44 (0)7700 900123')).toBe('+447700900123')
    expect(normalizeUkPhone('0044 7700 900123')).toBe('+447700900123')
    expect(normalizeUkPhone('12345')).toBeNull()
    expect(ukPhoneType('+447700900123')).toBe('mobile')
    expect(ukPhoneType('+441214960123')).toBe('landline')
  })
  it('normalises domains, names and postcodes', () => {
    expect(normalizeDomain('https://www.Acme-Plumbing.co.uk/contact')).toBe('acme-plumbing.co.uk')
    expect(normalizeName('Acme Plumbing Services Ltd')).toBe(normalizeName('ACME PLUMBING'))
    expect(extractUkPostcode('12 New St, Birmingham b2 4qa, UK')).toBe('B2 4QA')
    expect(extractUkPostcode('Wolverhampton WV1 1AA')).toBe('WV1 1AA')
  })
})

describe('website classification', () => {
  it('never says NO_WEBSITE just because Google has no URL', () => {
    expect(classifyWebsite({ websiteUrl: null, facts: null }).status).toBe('UNVERIFIED')
    expect(classifyWebsite({ websiteUrl: null, facts: { reachable: false, presence: { checked: true, candidates: ['acme.co.uk'], found_url: null } } }).status).toBe('NO_WEBSITE')
  })
  it('recognises social, directory and free subdomains', () => {
    expect(urlKind('https://www.facebook.com/acmeplumbing')).toBe('social')
    expect(urlKind('https://www.checkatrade.com/trades/acme')).toBe('directory')
    expect(urlKind('https://acme.wixsite.com/home')).toBe('free_subdomain')
    expect(classifyWebsite({ websiteUrl: 'https://facebook.com/acme', facts: null }).status).toBe('SOCIAL_ONLY')
    expect(classifyWebsite({ websiteUrl: 'https://acme.wixsite.com', facts: goodSite }).status).toBe('FREE_SUBDOMAIN')
  })
  it('needs two failed checks 6h apart before BROKEN_WEBSITE', () => {
    const down: AuditFacts = { reachable: false, error_kind: 'dns' }
    const first = classifyWebsite({ websiteUrl: 'https://acme.co.uk', facts: down })
    expect(first.status).toBe('UNVERIFIED')
    expect(first.needsRecheck).toBe(true)
    const now = new Date('2026-11-14T12:00:00Z')
    expect(classifyWebsite({ websiteUrl: 'https://acme.co.uk', facts: down, previousFailureAt: new Date('2026-11-14T09:00:00Z'), now }).status).toBe('UNVERIFIED')
    expect(classifyWebsite({ websiteUrl: 'https://acme.co.uk', facts: down, previousFailureAt: new Date('2026-11-14T05:00:00Z'), now }).status).toBe('BROKEN_WEBSITE')
    expect(classifyWebsite({ websiteUrl: 'https://acme.co.uk', facts: { reachable: false, error_kind: 'blocked' }, previousFailureAt: new Date(0), now }).status).toBe('UNVERIFIED')
  })
  it('classifies outdated, needs-redesign and good sites from evidence', () => {
    const now = new Date('2026-11-14')
    expect(classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: { ...goodSite, has_viewport: false }, now }).status).toBe('OUTDATED_WEBSITE')
    expect(classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: { ...goodSite, copyright_year: 2015, table_layout: true }, now }).status).toBe('OUTDATED_WEBSITE')
    expect(classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: { ...goodSite, copyright_year: 2015 }, now }).status).toBe('GOOD_WEBSITE')
    const weak = { ...goodSite, contact_form: false, has_cta: false, tel_links: 0, pagespeed: { fetched: true, performance: 31 } }
    const r = classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: weak, now })
    expect(r.status).toBe('NEEDS_REDESIGN')
    expect(r.findings.map(f => f.code)).toEqual(expect.arrayContaining(['no_contact_form', 'no_cta', 'no_click_to_call', 'slow_mobile']))
    expect(classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: goodSite, now }).status).toBe('GOOD_WEBSITE')
  })
  it('does not report slow speed when PageSpeed was not measured', () => {
    const r = classifyWebsite({ websiteUrl: 'https://a.co.uk', facts: { ...goodSite, pagespeed: { fetched: false, error: 'quota' } } })
    expect(r.findings.find(f => f.code === 'slow_mobile')).toBeUndefined()
  })
})

describe('opportunity scoring', () => {
  it('gives an excellent score to an established business with no website', () => {
    const s = scoreLead({ websiteStatus: 'NO_WEBSITE', facts: null, rating: 4.8, reviewCount: 60, weights: W })
    expect(s.score).toBe(100)
    expect(s.labelKey).toBe('excellent')
    expect(s.factors.find(f => f.key === 'poor_pagespeed')).toBeUndefined()
  })
  it('does not add points for unverified data', () => {
    const s = scoreLead({ websiteStatus: 'UNVERIFIED', facts: null, rating: null, reviewCount: null, weights: W })
    expect(s.score).toBe(0)
    expect(s.factors.every(f => f.points === 0 || !f.verified)).toBe(true)
  })
  it('scores a good website low and a weak website higher, with factor breakdown', () => {
    const good = scoreLead({ websiteStatus: 'GOOD_WEBSITE', facts: goodSite, rating: 4.9, reviewCount: 80, weights: W })
    const weakFacts: AuditFacts = { ...goodSite, has_viewport: false, contact_form: false, has_cta: false, pagespeed: { fetched: true, performance: 20 } }
    const weak = scoreLead({ websiteStatus: 'OUTDATED_WEBSITE', facts: weakFacts, rating: 4.9, reviewCount: 80, weights: W })
    expect(good.score).toBeLessThan(40)
    expect(weak.score).toBeGreaterThan(good.score + 30)
    const mobile = weak.factors.find(f => f.key === 'poor_mobile')!
    const speed = weak.factors.find(f => f.key === 'poor_pagespeed')!
    expect(mobile.points).toBe(5) // pe jumătate: lipsa viewport-ului a dus deja la „outdated”
    expect(mobile.points + speed.points).toBeLessThanOrEqual(15)
  })
  it('does not count PageSpeed when it was not measured', () => {
    const s = scoreLead({ websiteStatus: 'GOOD_WEBSITE', facts: { ...goodSite, pagespeed: null }, rating: null, reviewCount: null, weights: W })
    expect(s.factors.find(f => f.key === 'poor_pagespeed')).toMatchObject({ points: 0, verified: false })
  })
})

describe('compliance', () => {
  it('blocks suppressed contacts and warns for sole traders', () => {
    expect(checkContact({ channel: 'email', subscriberType: 'corporate', suppressed: true }).allowed).toBe(false)
    expect(checkContact({ channel: 'email', subscriberType: 'sole_trader', suppressed: false }).level).toBe('warning')
    expect(checkContact({ channel: 'email', subscriberType: 'corporate', suppressed: false, lawfulBasis: 'LIA done' }).level).toBe('ok')
    expect(checkContact({ channel: 'phone', subscriberType: 'corporate', suppressed: false }).messages.join(' ')).toMatch(/TPS/)
  })
})

describe('session & csv & filters', () => {
  it('signs and verifies sessions, rejecting tampering and expiry', async () => {
    process.env.CRM_PASSWORD = 'correct horse'
    const t = await createSession()
    expect(await verifySession(t)).toBe(true)
    expect(await verifySession(t.replace(/.$/, c => (c === 'a' ? 'b' : 'a')))).toBe(false)
    expect(await verifySession(await createSession(Date.now() - 30 * 86400_000))).toBe(false)
    expect(await checkPassword('correct horse')).toBe(true)
    expect(await checkPassword('wrong')).toBe(false)
  })
  it('escapes CSV formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('Acme, Ltd')).toBe('"Acme, Ltd"')
  })
  it('builds parameterised filters only', () => {
    const f = buildLeadFilter(new URLSearchParams("q=x'; DROP TABLE businesses;--&website_status=NO_WEBSITE,SOCIAL_ONLY&min_score=60&sort=bogus"))
    expect(f.where).not.toContain('DROP')
    expect(f.params).toContain("%x'; drop table businesses;--%")
    expect(f.order).toContain('opportunity_score')
  })
})
