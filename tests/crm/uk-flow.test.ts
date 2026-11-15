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
