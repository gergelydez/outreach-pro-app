import { describe, it, expect, beforeEach } from 'vitest'
import { normalizePhone, isMobile, waDigits, buildCountryQuery, categoriesFor, citiesFor, asCountry } from '@/lib/crm/countries'
import { buildMessages, TEMPLATES } from '@/lib/crm/uk-templates'
import { rotation } from '@/lib/crm/hunt'
import { freshDb, req } from './helpers'
import { q, one } from '@/lib/crm/db'
import { GET as simpleGet } from '@/app/api/crm/simple/route'
import { GET as huntGet } from '@/app/api/crm/hunt/route'

describe('România', () => {
  it('normalizes Romanian numbers and recognizes mobiles', () => {
    expect(normalizePhone('0722 123 456', 'RO')).toBe('+40722123456')
    expect(normalizePhone('+40 722 123 456', 'RO')).toBe('+40722123456')
    expect(isMobile('+40722123456', 'RO')).toBe(true)
    expect(isMobile('+40212345678', 'RO')).toBe(false)
    expect(waDigits('+40722123456')).toBe('40722123456')
    expect(asCountry('RO')).toBe('RO')
  })
  it('has Romanian categories, towns and queries', () => {
    expect(categoriesFor('RO').length).toBeGreaterThan(20)
    expect(citiesFor('RO').length).toBeGreaterThan(20)
    const r = rotation(0, 'RO', 11)
    expect(r.category).toBeTruthy()
    expect(buildCountryQuery('RO', 'pensiune', 'Brașov', 'Brașov')).toContain('Brașov')
  })
  it('writes the messages in Romanian, with a reminder', () => {
    const m = buildMessages(TEMPLATES.RO, { name: 'Pensiunea Bradul', trades: 'pensiune', website_status: 'NO_WEBSITE', findingCodes: [], country: 'RO' })
    expect(m.first).toMatch(/Sunt Grig 👋/)
    expect(m.first).toMatch(/v-am pregătit gratuit un concept/)
    expect(m.second).toMatch(/factură pe firmă, dacă doriți\. Vreți să vedeți cum arată conceptul creat pentru dumneavoastră\?$/)
    expect(m.second).toMatch(/ajut afacerile să crească/)
    expect(m.first + m.second).not.toMatch(/\bHi\b|website/i)
    expect(m.followup.length).toBeGreaterThan(10)
    expect(m.price).toMatch(/lei/)
  })
})

describe('lists: return to / interested / clients + reminder', () => {
  beforeEach(async () => { await freshDb() })

  it('reminder: contacted → follow_up_1 → follow_up_2; reply moves it to interested; stats count', async () => {
    const { POST: eventsPost } = await import('@/app/api/crm/leads/[id]/events/route')
    const b = await one<{ id: string }>(`INSERT INTO businesses (name, category, city, lead_source, website_status, phone_e164, country) VALUES ('Pensiunea Bradul', 'pension', 'Brașov', 'google_places', 'NO_WEBSITE', '+40722123456', 'RO') RETURNING id`)
    const ctx = { params: { id: b!.id } }
    const list = async (show: string) => (await (await simpleGet(req(`/api/crm/simple?country=RO&show=${show}`))).json()).rows as { stage: string }[]
    expect(await list('pool')).toHaveLength(1)
    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'contacted', channel: 'whatsapp', schedule_follow_ups: true } }), ctx)
    expect(await list('pool')).toHaveLength(0)
    expect((await list('waiting')).map(r => r.stage)).toEqual(['contacted'])
    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'follow_up', channel: 'whatsapp' } }), ctx)
    expect((await list('waiting'))[0].stage).toBe('follow_up_1')
    const open = await one<{ n: string }>(`SELECT count(*)::text AS n FROM follow_up_tasks WHERE business_id = $1 AND status = 'done'`, [b!.id])
    expect(Number(open!.n)).toBe(1)
    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'follow_up', channel: 'whatsapp' } }), ctx)
    expect((await list('waiting'))[0].stage).toBe('follow_up_2')
    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'reply', reply_status: 'positive', channel: 'whatsapp' } }), ctx)
    expect(await list('waiting')).toHaveLength(0)
    expect((await list('interested')).map(r => r.stage)).toEqual(['interested'])
    const h = await (await huntGet(req('/api/crm/hunt?country=RO'))).json()
    expect(h.stats).toMatchObject({ contacted: 1, replied: 1, interested: 1, won: 0, contacted_today: 1 })
    expect(h.target).toBe(75)
    expect(typeof h.googleCostMonth).toBe('number')
    await q(`UPDATE businesses SET stage = 'won' WHERE id = $1`, [b!.id])
    expect(await list('won')).toHaveLength(1)
    expect(await list('interested')).toHaveLength(0)
    // alte țări nu văd firma
    expect((await (await simpleGet(req('/api/crm/simple?country=UK&show=won'))).json()).rows).toHaveLength(0)
  })
})

describe('search by name or phone', () => {
  beforeEach(async () => { await freshDb() })

  it('finds a business in any stage by part of the name (without diacritics) or by phone in any format', async () => {
    await q(`INSERT INTO businesses (name, category, city, lead_source, website_status, phone, phone_e164, country, stage) VALUES
      ('Hanul Izvorul Rece', 'pension', 'Sinaia', 'google_places', 'NO_WEBSITE', '0723 351 803', '+40723351803', 'RO', 'won'),
      ('Pensiunea Țărănească', 'pension', 'Bran', 'google_places', 'NO_WEBSITE', '0744 111 222', '+40744111222', 'RO', 'new_lead'),
      ('Kovács Fűtés', 'heating', 'Debrecen', 'google_places', 'NO_WEBSITE', '06 30 123 4567', '+36301234567', 'HU', 'contacted')`)
    const find = async (term: string, country = 'RO') => ((await (await simpleGet(req(`/api/crm/simple?country=${country}&show=search&q=${encodeURIComponent(term)}`))).json()).rows as { name: string }[]).map(r => r.name)
    expect(await find('izvorul')).toEqual(['Hanul Izvorul Rece'])
    expect(await find('taraneasca')).toEqual(['Pensiunea Țărănească'])
    expect(await find('0723 351 803')).toEqual(['Hanul Izvorul Rece'])
    expect(await find('+40723351803')).toEqual(['Hanul Izvorul Rece'])
    expect(await find('351803')).toEqual(['Hanul Izvorul Rece'])
    expect(await find('pensiune')).toHaveLength(1)
    expect(await find('kovacs')).toEqual([]) // altă țară
    expect(await find('kovacs', 'HU')).toEqual(['Kovács Fűtés'])
    expect(await find('+36 30 123 4567', 'HU')).toEqual(['Kovács Fűtés'])
    expect(await find('x')).toEqual([]) // prea scurt
  })
})
