import { describe, it, expect, beforeEach } from 'vitest'
import { extractFacts, isPublicIp, candidateDomains, quickAudit, safeFetch } from '@/lib/crm/quick-audit'
import { runPendingAudits } from '@/lib/crm/audit-runner'
import { runDiscovery } from '@/lib/crm/discovery'
import { one } from '@/lib/crm/db'
import { PATCH as leadPatch } from '@/app/api/crm/leads/[id]/route'
import { applyAudit, type BusinessRow } from '@/lib/crm/businesses'
import { freshDb, place, legacyPlacesMock, req } from './helpers'
import { waNumber, findingRo, STATUS_RO } from '@/lib/crm/ro'

process.env.GOOGLE_PLACES_API_KEY = 'test-key'

const OLD = `<html><head><title>Welcome</title><meta name="generator" content="WordPress 4.9.8"><script src="/js/jquery-1.8.3.min.js"></script></head>
<body><table width="100%"><tr><td><font>Kings Heath Plumbing</font><font>Boilers</font><font>Call 0121 444 1234</font>
<p>Email info@kingsheathplumbing.co.uk</p><p>&copy; 2016 Kings Heath Plumbing</p></td></tr></table></body></html>`
const MODERN = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Electrician Birmingham | Brummie Sparks</title>
<meta name="description" content="NICEIC electricians"><script type="application/ld+json">{"@type":"Electrician"}</script></head>
<body><header><nav><a href="/">Home</a><a href="/services/rewiring">Rewiring</a><a href="/contact">Contact</a></nav></header>
<a href="tel:+441214445555">Call now</a><a href="https://wa.me/447700900222">WhatsApp us</a>
<form action="/quote"><input type="tel" name="phone"><textarea></textarea><button>Get a free quote</button></form>
<footer>Kings Heath, Birmingham B14 7QH · © 2019–2026 Brummie Sparks</footer></body></html>`

const site = (pages: Record<string, string>) => (async (input: string | URL | Request) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const html = pages[u]
  return html ? new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 })
}) as unknown as typeof fetch

describe('built-in website audit (no Python worker)', () => {
  beforeEach(async () => { await freshDb() })

  it('extracts the same facts as the worker', () => {
    const o = extractFacts(OLD, 'http://kingsheathplumbing.co.uk/', 'Birmingham', 2026)
    expect(o).toMatchObject({ has_viewport: false, copyright_year: 2016, contact_form: false, has_cta: false, table_layout: true, whatsapp_links: [] })
    expect(o.old_tech).toEqual(expect.arrayContaining(['jQuery 1.8.3', '<font> tags', 'WordPress 4.9.8']))
    expect(o.emails).toEqual(['info@kingsheathplumbing.co.uk'])
    const m = extractFacts(MODERN, 'https://brummiesparks.co.uk/', 'Birmingham', 2026)
    expect(m).toMatchObject({ has_viewport: true, contact_form: true, has_cta: true, whatsapp_links: ['https://wa.me/447700900222'], copyright_year: 2026, table_layout: false })
    expect(m.local_seo).toEqual({ mentions_city: true, has_postcode: true, local_business_schema: true })
    expect(m.service_links).toBe(1)
  })

  it('blocks private / internal addresses', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '172.20.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPublicIp(ip)).toBe(false)
    expect(isPublicIp('8.8.8.8')).toBe(true)
    expect((await safeFetch('http://169.254.169.254/latest/meta-data/')).errorKind).toBe('unsafe_target')
    expect((await safeFetch('http://localhost:3000/')).errorKind).toBe('unsafe_target')
    expect((await safeFetch('file:///etc/passwd')).errorKind).toBe('unsafe_target')
  })

  it('checks likely domains for businesses without a website', async () => {
    expect(candidateDomains('Wolves Electrical Services Ltd')).toEqual(['wolveselectrical.co.uk', 'wolveselectrical.com', 'wolves-electrical.co.uk'])
    const f = await quickAudit({ name: 'Wolves Electrical', city: 'Wolverhampton', phone: null, website_url: null },
      { allowPrivate: true, fetchImpl: site({ 'https://wolveselectrical.com/': '<title>Wolves Electrical Wolverhampton</title>' }) })
    expect(f.presence).toEqual({ checked: true, candidates: ['wolveselectrical.co.uk', 'wolveselectrical.com', 'wolves-electrical.co.uk'], found_url: 'https://wolveselectrical.com/' })
  })

  it('runs queued audits inline after discovery and scores the leads', async () => {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, legacyPlacesMock([[
      place('q1', { displayName: { text: 'Kings Heath Plumbing' }, websiteUri: 'http://kingsheathplumbing.co.uk/' }),
      place('q2', { displayName: { text: 'Brummie Sparks' }, websiteUri: 'https://brummiesparks.co.uk/' }),
      place('q3', { displayName: { text: 'Selly Oak Drain' }, websiteUri: 'https://www.facebook.com/sellyoakdrain' }),
    ]]).fetch)
    const r = await runPendingAudits(8, { allowPrivate: true, fetchImpl: site({ 'http://kingsheathplumbing.co.uk/': OLD, 'https://brummiesparks.co.uk/': MODERN }) })
    expect(r.remaining).toBe(0)
    const by = Object.fromEntries(r.processed.map(p => [p.name, p.status]))
    expect(by).toEqual({ 'Kings Heath Plumbing': 'OUTDATED_WEBSITE', 'Brummie Sparks': 'GOOD_WEBSITE', 'Selly Oak Drain': 'SOCIAL_ONLY' })
    const k = await one<BusinessRow>(`SELECT * FROM businesses WHERE google_place_id = 'q1'`)
    expect(k!.email).toBe('info@kingsheathplumbing.co.uk')
    expect(k!.opportunity_score).toBeGreaterThanOrEqual(60)
  })

  it('a manual WhatsApp check is kept when the site is audited again', async () => {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 1 }, legacyPlacesMock([[place('w1', { websiteUri: 'http://kingsheathplumbing.co.uk/' })]]).fetch)
    const b = (await one<BusinessRow>(`SELECT * FROM businesses WHERE google_place_id = 'w1'`))!
    await leadPatch(req('/x', { method: 'PATCH', json: { whatsapp_status: 'FOUND' } }), { params: { id: b.id } })
    await applyAudit(b.id, { reachable: true, https: false, has_viewport: false, whatsapp_links: [] })
    const after = (await one<{ whatsapp_status: string; whatsapp_source: string }>('SELECT whatsapp_status, whatsapp_source FROM businesses WHERE id = $1', [b.id]))!
    expect(after).toEqual({ whatsapp_status: 'FOUND', whatsapp_source: 'manual' })
  })

  it('Romanian texts and WhatsApp numbers', () => {
    expect(waNumber('+447700900123')).toBe('447700900123')
    expect(waNumber('+441214960000')).toBeNull() // fix: fără WhatsApp
    expect(findingRo('no_https', 'x')).toMatch(/Nesigur/)
    expect(STATUS_RO.NO_WEBSITE.label).toBe('Fără site')
  })
})
