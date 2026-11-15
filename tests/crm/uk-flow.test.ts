import { describe, it, expect, beforeEach } from 'vitest'
import { buildMessages, mainProblem, DEFAULT_TEMPLATES, DEMO_STATUSES } from '@/lib/crm/uk-templates'
import { localityFromAddress } from '@/lib/place-context'
import { withConceptBanner } from '@/lib/preview'
import { freshDb, req } from './helpers'
import { q, one } from '@/lib/crm/db'
import { PATCH as leadPatch } from '@/app/api/crm/leads/[id]/route'
import { GET as simpleGet } from '@/app/api/crm/simple/route'

describe('UK flow: messages, demo link, addresses', () => {
  beforeEach(async () => { await freshDb() })

  it('builds the short two-part WhatsApp message from the template', () => {
    const t = { ...DEFAULT_TEMPLATES, me: 'Geri' }
    const none = buildMessages(t, { name: 'Moseley Plumbing', trades: 'plumbers', website_status: 'NO_WEBSITE', findingCodes: [] })
    expect(none.first).toBe("Hi, I'm Geri 👋 I came across Moseley Plumbing on Google and noticed that, unlike other plumbers nearby, you don't have a website.")
    expect(none.second).toMatch(/free concept of your own website/)
    expect(none.second).toMatch(/university student/)
    expect(none.first.length).toBeLessThan(200) // prima parte rămâne scurtă
    const old = buildMessages(t, { name: 'Kings Heath Plumbing', trades: 'plumbers', website_status: 'OUTDATED_WEBSITE', findingCodes: ['no_https', 'not_mobile_friendly'] })
    expect(old.first).toMatch(/I noticed it isn't set up for phones/)
    const social = buildMessages(t, { name: 'Selly Oak Drain', trades: 'plumbers', website_status: 'SOCIAL_ONLY', findingCodes: [] })
    expect(social.first).toMatch(/social media or directory page/)
    const demo = buildMessages(t, { name: 'X', trades: 'plumbers', website_status: 'NO_WEBSITE', findingCodes: [], previewUrl: 'https://app.test/p/x-123' })
    expect(demo.demo).toContain('https://app.test/p/x-123')
    expect(mainProblem([])).toBe('it could do with a refresh')
    expect(DEMO_STATUSES).not.toContain('GOOD_WEBSITE')
  })

  it('reads the town from UK addresses (without postcode / country)', () => {
    expect(localityFromAddress('1 High St, Kings Heath, Birmingham B14 7QH, UK', 'Birmingham')).toBe('Birmingham')
    expect(localityFromAddress('Str. Unirii 5, Baia Mare 430000, România', 'Baia Mare')).toBe('Baia Mare')
  })

  it('demo banner in English for UK', () => {
    const html = withConceptBanner('<html><head></head><body>x</body></html>', 'Moseley Plumbing', 'Geri', 'en')
    expect(html).toContain('Concept by Geri · not the official site')
    expect(html).toContain('noindex')
    expect(withConceptBanner('<html><body></body></html>', 'X', '', 'ro')).toContain('nu e site-ul oficial')
  })

  it('saves the published demo link on the lead (migration 003) and returns it to the page', async () => {
    const r = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source) VALUES ('Moseley Plumbing', 'plumber', 'Birmingham', 'google_places') RETURNING id`)
    await leadPatch(req('/x', { method: 'PATCH', json: { preview_url: 'javascript:alert(1)' } }), { params: { id: r!.id } })
    expect((await one<{ preview_url: string | null }>('SELECT preview_url FROM businesses WHERE id = $1', [r!.id]))!.preview_url).toBeNull()
    await leadPatch(req('/x', { method: 'PATCH', json: { preview_url: 'https://app.test/p/moseley-plumbing-a1b2c3' } }), { params: { id: r!.id } })
    const rows = await (await simpleGet(req('/api/crm/simple?city=Birmingham&category=plumber&show=all'))).json()
    expect(rows.rows[0].preview_url).toBe('https://app.test/p/moseley-plumbing-a1b2c3')
    expect((await q(`SELECT 1 FROM crm_activity WHERE type = 'demo_published'`)).length).toBe(1)
  })
})

describe('"has a website" button + ticked problems', () => {
  beforeEach(async () => { await freshDb() })

  it('adds the website found on Google, audits it now, and ticked problems drive the rebuild message', async () => {
    const { POST: sitePost } = await import('@/app/api/crm/leads/[id]/site/route')
    const { buildMessages, TEMPLATES } = await import('@/lib/crm/uk-templates')
    process.env.AUDIT_ALLOW_PRIVATE_TARGETS = '1'
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, phone_e164) VALUES ('Moseley Plumbing', 'plumber', 'Birmingham', 'google_places', 'NO_WEBSITE', '+447700900123') RETURNING id`)
    const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Moseley Plumbing Birmingham</title></head><body><a href="tel:07700900123">Call now</a><form><textarea></textarea></form><p>Birmingham B13 8AR © 2026</p></body></html>'
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch
    try {
      const res = await (await sitePost(req('/x', { method: 'POST', json: { url: 'moseleyplumbing.co.uk' } }), { params: { id: b!.id } })).json()
      expect(res.website_url).toBe('https://moseleyplumbing.co.uk/')
      expect(res.status).toBe('GOOD_WEBSITE') // auditul nu vede probleme…
    } finally { globalThis.fetch = realFetch; delete process.env.AUDIT_ALLOW_PRIVATE_TARGETS }
    // …dar tu vezi că arată vechi și nu e ok pe telefon → bifezi; firma rămâne „de refăcut”
    await leadPatch(req('/x', { method: 'PATCH', json: { manual_problems: ['outdated_signal', 'not_mobile_friendly', 'hacker'] } }), { params: { id: b!.id } })
    const row = (await one<{ website_status: string; manual_problems: string[]; website_url: string }>('SELECT website_status, manual_problems, website_url FROM businesses WHERE id = $1', [b!.id]))!
    expect(row).toEqual({ website_status: 'NEEDS_REDESIGN', manual_problems: ['outdated_signal', 'not_mobile_friendly'], website_url: 'https://moseleyplumbing.co.uk/' })
    const m = buildMessages(TEMPLATES.UK, { name: 'Moseley Plumbing', trades: 'plumbers', website_status: row.website_status, findingCodes: row.manual_problems })
    expect(m.first).toBe("Hi, I'm Geri 👋 I came across Moseley Plumbing on Google and had a look at your website – I noticed it isn't set up for phones, so the text is tiny on mobile and it looks a bit dated.")
    expect(m.second).toMatch(/modern version of your website/)
    // în lista zilei (are mobil, site de refăcut)
    const pool = await (await simpleGet(req('/api/crm/simple?show=pool'))).json()
    expect(pool.rows.map((x: { id: string }) => x.id)).toContain(b!.id)
  })

  it('rejects invalid links', async () => {
    const { POST: sitePost } = await import('@/app/api/crm/leads/[id]/site/route')
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source) VALUES ('X', 'plumber', 'Birmingham', 'google_places') RETURNING id`)
    expect((await sitePost(req('/x', { method: 'POST', json: { url: 'javascript:alert(1)' } }), { params: { id: b!.id } })).status).toBe(400)
    expect((await sitePost(req('/x', { method: 'POST', json: { url: '' } }), { params: { id: b!.id } })).status).toBe(400)
  })
})
