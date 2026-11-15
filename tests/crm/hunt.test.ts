import { describe, it, expect, beforeEach, vi } from 'vitest'
import { huntStep, poolCount, rotation, HUNT_CATEGORIES, HUNT_CITIES, getHuntState } from '@/lib/crm/hunt'
import { runDiscovery, placesMode } from '@/lib/crm/discovery'
import { saveSetting, DEFAULT_SETTINGS } from '@/lib/crm/settings'
import { one, q } from '@/lib/crm/db'
import { PATCH as leadPatch } from '@/app/api/crm/leads/[id]/route'
import { GET as cronGet } from '@/app/api/crm/hunt/cron/route'
import { freshDb, place, legacyPlacesMock, newPlacesMock, req } from './helpers'

process.env.GOOGLE_PLACES_API_KEY = 'test-key'

let seq = 0
// fiecare căutare primește firme noi: jumătate cu mobil (07…), jumătate cu fix; fără site → NO_WEBSITE
function uniquePlaces(n: number, opts: { mobileEvery?: number; site?: string } = {}) {
  return Array.from({ length: n }, () => {
    const i = ++seq
    const mobile = i % (opts.mobileEvery ?? 2) === 0
    return place(`h${i}`, {
      displayName: { text: `Business ${i}` },
      nationalPhoneNumber: mobile ? `07700 9${String(10000 + i).slice(-5)}` : `0121 496 ${String(1000 + (i % 9000)).slice(-4)}`,
      internationalPhoneNumber: mobile ? `+44 7700 9${String(10000 + i).slice(-5)}` : undefined,
      ...(opts.site ? { websiteUri: `https://www.facebook.com/biz${i}` } : {}),
    })
  })
}
// mock pentru API-ul nou care dă 20 de firme noi la fiecare căutare
function newApiEndless(mobileEvery = 2) {
  const calls = { n: 0 }
  const fn = (async () => { calls.n++; return new Response(JSON.stringify({ places: uniquePlaces(20, { mobileEvery }) }), { status: 200 }) }) as unknown as typeof fetch
  return { fn, calls }
}
// site-urile „probabile” pentru firmele fără site nu există
const noSites = (async () => new Response('nf', { status: 404 })) as unknown as typeof fetch

describe('daily hunt: 50 qualified UK businesses with a mobile number', () => {
  beforeEach(async () => { await freshDb(); seq = 0 })

  it('rotates through all UK towns and many business types', () => {
    expect(HUNT_CATEGORIES.length).toBeGreaterThanOrEqual(40)
    expect(HUNT_CITIES.length).toBeGreaterThanOrEqual(100)
    expect(rotation(0)).toMatchObject({ category: 'barber', city: 'Birmingham' })
    expect(rotation(1).category).toBe(HUNT_CATEGORIES[1])
    expect(rotation(HUNT_CATEGORIES.length).city).toBe(HUNT_CITIES[1].city)
  })

  it('keeps searching until the list has 50, saving only mobile numbers, then stops', async () => {
    const g = newApiEndless(2)
    let steps = 0
    let r
    do { r = await huntStep({ fetchImpl: g.fn, siteFetch: noSites, allowPrivate: true, budgetMs: 60_000 }); steps++ } while (!r.done && steps < 20)
    expect(r.done).toBe(true)
    expect(r.pool).toBeGreaterThanOrEqual(50)
    expect(steps).toBe(5) // 10 firme cu mobil la fiecare căutare
    const landlines = await one<{ n: string }>(`SELECT count(*)::text AS n FROM businesses WHERE phone_e164 NOT LIKE '+447%'`)
    expect(Number(landlines!.n)).toBe(0) // vânătoarea salvează doar mobile
    const statuses = await q<{ website_status: string }>(`SELECT DISTINCT website_status FROM businesses`)
    expect(statuses.map(s => s.website_status)).toEqual(['NO_WEBSITE'])
    // lista e plină: un pas în plus nu mai caută nimic
    const before = g.calls.n
    const again = await huntStep({ fetchImpl: g.fn, siteFetch: noSites, allowPrivate: true })
    expect(again.stoppedReason).toBe('target_reached')
    expect(g.calls.n).toBe(before)
    const st = await getHuntState()
    expect(st.steps_today).toBe(5)
    expect(st.cursor).toBe(5)
    expect(st.log[0]).toMatch(/Barbers · Birmingham: 20 găsite, 10 noi cu mobil/)
  })

  it('a business marked "no WhatsApp" leaves the list and the next hunt refills it', async () => {
    await saveSetting('target_market', { ...DEFAULT_SETTINGS.target_market, daily_target: 10 })
    const g = newApiEndless(1) // toate cu mobil
    await huntStep({ fetchImpl: g.fn, siteFetch: noSites, allowPrivate: true, budgetMs: 60_000 })
    expect(await poolCount()).toBe(20)
    const ids = await q<{ id: string }>(`SELECT id FROM businesses ORDER BY created_at LIMIT 15`)
    for (const { id } of ids) await leadPatch(req('/x', { method: 'PATCH', json: { whatsapp_status: 'NOT_FOUND' } }), { params: { id } })
    expect(await poolCount()).toBe(5)
    const r = await huntStep({ fetchImpl: g.fn, siteFetch: noSites, allowPrivate: true, budgetMs: 60_000 })
    expect(r.pool).toBe(25)
    expect(r.done).toBe(true)
  })

  it('stops at the daily limit of new businesses (cost control)', async () => {
    await saveSetting('limits', { ...DEFAULT_SETTINGS.limits, daily_discovery_max: 15 })
    const g = newApiEndless(1)
    const r1 = await huntStep({ fetchImpl: g.fn, siteFetch: noSites, allowPrivate: true, budgetMs: 60_000 })
    expect(r1.pool).toBe(15)
    expect(r1.stoppedReason).toBe('daily_limit')
  })

  it('uses the cheaper Places API (New) when enabled: no Place Details calls', async () => {
    const m = newPlacesMock([[place('n1', { nationalPhoneNumber: '07700 900111', internationalPhoneNumber: '+44 7700 900111' }), place('n2')]])
    const r = await runDiscovery({ city: 'Leeds', category: 'barber', limit: 10, mobileOnly: true }, m.fetch)
    expect(r.newCount).toBe(1) // n2 are fix → nu se salvează la vânătoare
    expect(m.calls).toEqual({ search: 1, other: 0 })
    expect(await placesMode()).toBe('new')
    const usage = await q<{ operation: string }>(`SELECT operation FROM api_usage WHERE provider = 'google_places'`)
    expect(usage.map(u => u.operation)).toEqual(['textSearchNew'])
  })

  it('falls back to the classic API when the new one is not enabled, and remembers it', async () => {
    const m = legacyPlacesMock([[place('l1', { nationalPhoneNumber: '07700 900222' })]])
    const r = await runDiscovery({ city: 'Leeds', category: 'barber', limit: 10, mobileOnly: true }, m.fetch)
    expect(r.newCount).toBe(1)
    expect(m.calls.newApi).toBe(1)
    expect(await placesMode()).toBe('legacy')
    const m2 = legacyPlacesMock([[place('l2', { nationalPhoneNumber: '07700 900333' })]])
    await runDiscovery({ city: 'York', category: 'barber', limit: 10, mobileOnly: true }, m2.fetch)
    expect(m2.calls.newApi).toBe(0) // nu mai încearcă API-ul nou în aceeași zi
  })

  it('the automatic morning run only accepts Vercel Cron / its own chain token', async () => {
    delete process.env.CRON_SECRET
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret'
    expect((await cronGet(req('/api/crm/hunt/cron'))).status).toBe(401)
    expect((await cronGet(req('/api/crm/hunt/cron', { headers: { 'x-hunt-token': 'forged' } }))).status).toBe(401)
    vi.stubGlobal('fetch', newApiEndless(1).fn)
    try {
      await saveSetting('target_market', { ...DEFAULT_SETTINGS.target_market, daily_target: 5 })
      const res = await cronGet(req('/api/crm/hunt/cron', { headers: { 'user-agent': 'vercel-cron/1.0' } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.done).toBe(true)
      expect(body.chained).toBe(false)
      expect((await getHuntState()).last_auto_at).toBeTruthy()
    } finally { vi.unstubAllGlobals() }
  })
})
