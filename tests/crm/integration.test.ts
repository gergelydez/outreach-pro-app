import { describe, it, expect, beforeEach, vi } from 'vitest'
import { freshDb, req, place, legacyPlacesMock } from './helpers'
import { q, one, runMigrations, type Database } from '@/lib/crm/db'
import { runDiscovery } from '@/lib/crm/discovery'
import { claimJobs, failJob, enqueueJob } from '@/lib/crm/jobs'
import { runAi } from '@/lib/crm/ai'
import { saveSetting, DEFAULT_SETTINGS } from '@/lib/crm/settings'
import type { BusinessRow } from '@/lib/crm/businesses'
import { POST as workerClaim } from '@/app/api/crm/worker/claim/route'
import { POST as workerResult } from '@/app/api/crm/worker/result/route'
import { GET as leadsGet, POST as leadsPost } from '@/app/api/crm/leads/route'
import { GET as leadGet, PATCH as leadPatch, DELETE as leadDelete } from '@/app/api/crm/leads/[id]/route'
import { POST as eventsPost } from '@/app/api/crm/leads/[id]/events/route'
import { POST as proposalCreate } from '@/app/api/crm/proposals/route'
import { PATCH as proposalPatch, GET as proposalGet } from '@/app/api/crm/proposals/[id]/route'
import { GET as dashboardGet } from '@/app/api/crm/dashboard/route'
import { GET as reportsGet } from '@/app/api/crm/reports/route'
import { POST as discoveryPost } from '@/app/api/crm/discovery/route'
import { POST as aiPost } from '@/app/api/crm/ai/route'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'
import { createSession, SESSION_COOKIE } from '@/lib/crm/session'

let database: Database
process.env.GOOGLE_PLACES_API_KEY = 'test-key'
process.env.CRM_WORKER_TOKEN = 'worker-secret'
process.env.CRM_PASSWORD = 'pw'
const W = { authorization: 'Bearer worker-secret' }

function mockPlaces(pages: Record<string, unknown>[][]) {
  return legacyPlacesMock(pages).fetch
}

beforeEach(async () => { database = await freshDb() })

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await runMigrations(database)).toEqual([])
  })
})

describe('discovery', () => {
  it('saves new businesses, skips duplicates on a second run and queues audits', async () => {
    const pages = [[place('p1', { websiteUri: 'https://www.acme-plumbing.co.uk/' }), place('p2'), place('p3', { businessStatus: 'CLOSED_PERMANENTLY' })]]
    const r1 = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 25 }, mockPlaces(pages))
    expect(r1).toMatchObject({ found: 3, newCount: 2, duplicates: 0, filtered: 1 })
    const jobs = await q('SELECT * FROM audit_jobs')
    expect(jobs).toHaveLength(2)
    const b = await one<BusinessRow>(`SELECT * FROM businesses WHERE google_place_id = 'p1'`)
    expect(b).toMatchObject({ website_domain: 'acme-plumbing.co.uk', phone_e164: '+441214961001', postcode: 'B1 1AA', website_status: 'UNVERIFIED', stage: 'new_lead' })
    expect((b!.field_sources as Record<string, { source: string }>).phone.source).toBe('google_places')
    const src = await one<{ expires_at: string }>('SELECT expires_at FROM business_sources WHERE business_id = $1', [b!.id])
    expect(new Date(src!.expires_at).getTime()).toBeGreaterThan(Date.now() + 25 * 86400_000)

    // aceeași afacere cu alt Place ID, dar același domeniu / telefon → duplicat
    const r2 = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 25 }, mockPlaces([[place('p1'), place('pX', { websiteUri: 'http://acme-plumbing.co.uk' }), place('pY', { nationalPhoneNumber: '0121 496 1002' })]]))
    expect(r2).toMatchObject({ newCount: 0, duplicates: 3 })
    expect((await q('SELECT id FROM businesses')).length).toBe(2)
  })

  it('flags weak name+postcode matches instead of merging', async () => {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, mockPlaces([[place('a1', { displayName: { text: 'Acme Plumbing Ltd' } })]]))
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, mockPlaces([[place('a2', { displayName: { text: 'ACME Plumbing' }, nationalPhoneNumber: '0121 000 9999' })]]))
    expect(r.newCount).toBe(1)
    const dup = await one<{ possible_duplicate_of: string | null }>(`SELECT possible_duplicate_of FROM businesses WHERE google_place_id = 'a2'`)
    expect(dup!.possible_duplicate_of).toBeTruthy()
  })

  it('applies rating/review/website filters, pagination and the daily limit', async () => {
    const r = await runDiscovery({ city: 'Birmingham', category: 'electrician', limit: 60, minRating: 4.5, minReviews: 30, websiteFilter: 'no_website' },
      mockPlaces([[place('e1'), place('e2', { rating: 4.0 }), place('e3', { userRatingCount: 5 })], [place('e4', { websiteUri: 'https://e4.co.uk' }), place('e5')]]))
    expect(r).toMatchObject({ found: 5, newCount: 2, filtered: 3 })
    await saveSetting('limits', { ...DEFAULT_SETTINGS.limits, daily_discovery_max: 3 })
    const r2 = await runDiscovery({ city: 'Birmingham', category: 'electrician', limit: 10 }, mockPlaces([[place('e6'), place('e7'), place('e8')]]))
    expect(r2).toMatchObject({ newCount: 1, stoppedReason: 'daily_limit' })
    const r3 = await runDiscovery({ city: 'Birmingham', category: 'electrician', limit: 10 }, mockPlaces([[place('e9')]]))
    expect(r3).toMatchObject({ newCount: 0, stoppedReason: 'daily_limit' })
  })

  it('does not re-import suppressed businesses', async () => {
    await q(`INSERT INTO suppression_list (kind, value) VALUES ('place', 's1')`)
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, mockPlaces([[place('s1'), place('s2')]]))
    expect(r.newCount).toBe(1)
  })

  it('reports provider errors on the job without crashing', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 })) as unknown as typeof fetch
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, f)
    expect(r.stoppedReason).toBe('error')
    expect((await one<{ status: string; error: string }>('SELECT status, error FROM discovery_jobs'))!.status).toBe('failed')
  })
})

describe('Google Places (classic API, same key as RO/HU tools)', () => {
  it('uses Text Search + Place Details, fetches details only for new businesses and tracks cost', async () => {
    const m = legacyPlacesMock([[place('g1', { websiteUri: 'https://g1.co.uk' }), place('g2')], [place('g3')]])
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 10 }, m.fetch)
    expect(r.newCount).toBe(3)
    expect(m.calls.textSearch).toBe(2) // a doua pagină prin next_page_token
    expect(m.calls.details).toBe(3)
    expect(m.calls.newApi).toBe(1) // API-ul nou încercat o dată; nu e activat → clasic
    const first = new URL(m.calls.urls.find(u => u.includes('/maps/api/'))!)
    expect(first.pathname).toBe('/maps/api/place/textsearch/json')
    expect(first.searchParams.get('region')).toBe('uk')
    expect(first.searchParams.get('query')).toContain('Birmingham')
    expect(m.calls.urls.some(u => u.includes('pagetoken=token1'))).toBe(true)
    const g1 = await one<BusinessRow>(`SELECT * FROM businesses WHERE google_place_id = 'g1'`)
    expect(g1).toMatchObject({ website_url: 'https://g1.co.uk', phone_e164: '+441214961001', google_maps_url: 'https://maps.google.com/?cid=g1' })
    const usage = await q<{ operation: string; units: number }>(`SELECT operation, units FROM api_usage WHERE provider = 'google_places' ORDER BY created_at`)
    expect(usage.filter(u => u.operation === 'textSearch')).toHaveLength(2)
    expect(usage.filter(u => u.operation === 'placeDetails').reduce((a, u) => a + Number(u.units), 0)).toBe(3)

    // a doua rulare: aceleași firme → zero cereri Place Details (nu plătim de două ori)
    const m2 = legacyPlacesMock([[place('g1'), place('g2'), place('g3')]])
    const r2 = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 10 }, m2.fetch)
    expect(r2).toMatchObject({ newCount: 0, duplicates: 3 })
    expect(m2.calls.details).toBe(0)
  })

  it('without a website filter it only buys the details it needs', async () => {
    const m = legacyPlacesMock([[place('h1'), place('h2'), place('h3'), place('h4'), place('h5')]])
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 2 }, m.fetch)
    expect(r.newCount).toBe(2)
    expect(m.calls.details).toBe(2)
  })

  it('works with the key saved in the app Settings page when Vercel has none (like the RO/HU tools)', async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY
    delete process.env.GOOGLE_PLACES_API_KEY
    const m = legacyPlacesMock([[place('k1')]])
    vi.stubGlobal('fetch', m.fetch)
    try {
      const none = await discoveryPost(req('/x', { method: 'POST', json: { city: 'Birmingham', category: 'plumber', limit: 1 } }))
      expect(none.status).toBe(503)
      const ok = await discoveryPost(req('/x', { method: 'POST', json: { city: 'Birmingham', category: 'plumber', limit: 1, google_api_key: 'browser-key' } }))
      expect((await ok.json()).newCount).toBe(1)
      expect(m.calls.urls.filter(u => u.includes('/maps/api/')).every(u => new URL(u).searchParams.get('key') === 'browser-key')).toBe(true)
    } finally { vi.unstubAllGlobals(); if (saved) process.env.GOOGLE_PLACES_API_KEY = saved }
  })

  it('treats an unusable next-page token as "no more results", keeping page 1', async () => {
    const m = legacyPlacesMock([[place('t1'), place('t2')], [place('t3')]])
    const flaky = (async (input: string | URL | Request) => {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
      if (u.searchParams.get('pagetoken')) return new Response(JSON.stringify({ status: 'INVALID_REQUEST' }), { status: 200 })
      return m.fetch(input as string)
    }) as unknown as typeof fetch
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 10 }, flaky)
    expect(r).toMatchObject({ newCount: 2, stoppedReason: 'no_more_results' })
    expect(r.error).toBeUndefined()
    expect((await one<{ status: string }>('SELECT status FROM discovery_jobs WHERE id = $1', [r.jobId]))!.status).toBe('done')
  })

  it('explains a denied key clearly', async () => {
    const denied = (async (input: string | URL | Request) => String(input instanceof Request ? input.url : input).includes('places.googleapis.com')
      ? new Response(JSON.stringify({ error: { message: 'PERMISSION_DENIED', status: 'PERMISSION_DENIED' } }), { status: 403 })
      : new Response(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'This API project is not authorized to use this API.' }), { status: 200 })) as unknown as typeof fetch
    const r = await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, denied)
    expect(r.stoppedReason).toBe('error')
    expect(r.error).toMatch(/REQUEST_DENIED.*Places API/)
  })
})

describe('job queue', () => {
  it('claims with SKIP LOCKED, backs off on failure and dead-letters', async () => {
    const id = (await enqueueJob('audit', null, {}, { key: 'k1', maxAttempts: 2 }))!
    expect(await enqueueJob('audit', null, {}, { key: 'k1' })).toBeNull() // idempotent
    const [job] = await claimJobs('w1', 5)
    expect(job.id).toBe(id)
    expect(await claimJobs('w2', 5)).toHaveLength(0)
    expect(await failJob(id, 'boom')).toBe('pending')
    const row = await one<{ run_after: string }>('SELECT run_after FROM audit_jobs WHERE id = $1', [id])
    expect(new Date(row!.run_after).getTime()).toBeGreaterThan(Date.now() + 60_000)
    await q(`UPDATE audit_jobs SET run_after = now() WHERE id = $1`, [id])
    await claimJobs('w1', 1)
    expect(await failJob(id, 'boom again')).toBe('dead')
  })
  it('reclaims jobs from a crashed worker', async () => {
    await enqueueJob('audit', null, {}, { key: 'k2' })
    await claimJobs('w1', 1)
    await q(`UPDATE audit_jobs SET locked_at = now() - interval '30 minutes'`)
    expect(await claimJobs('w2', 1)).toHaveLength(1)
  })
})

describe('worker protocol + audit application', () => {
  async function seed(extra: Record<string, unknown> = {}) {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, mockPlaces([[place('w1', { websiteUri: 'https://acme.co.uk', ...extra })]]))
    return (await one<{ id: string }>(`SELECT id FROM businesses WHERE google_place_id = 'w1'`))!.id
  }

  it('rejects requests without the worker token', async () => {
    expect((await workerClaim(req('/api/crm/worker/claim', { method: 'POST', json: {} }))).status).toBe(401)
  })

  it('classifies, scores and stores contacts with provenance', async () => {
    const id = await seed()
    const claim = await (await workerClaim(req('/api/crm/worker/claim', { method: 'POST', headers: W, json: { worker_id: 'test' } }))).json()
    expect(claim.jobs[0].business).toMatchObject({ id, website_url: 'https://acme.co.uk' })
    const facts = { reachable: true, https: false, has_viewport: false, title: 'Home', contact_form: false, has_cta: false, tel_links: 0, emails: ['info@acme.co.uk'],
      whatsapp_links: ['https://wa.me/447700900123'], pagespeed: { fetched: true, performance: 25 } }
    const res = await (await workerResult(req('/api/crm/worker/result', { method: 'POST', headers: W, json: { job_id: claim.jobs[0].id, ok: true, facts } }))).json()
    expect(res.status).toBe('OUTDATED_WEBSITE')
    const b = await one<BusinessRow & { whatsapp_source: string }>('SELECT * FROM businesses WHERE id = $1', [id])
    expect(b).toMatchObject({ website_status: 'OUTDATED_WEBSITE', whatsapp_status: 'FOUND', whatsapp_url: 'https://wa.me/447700900123', email: 'info@acme.co.uk' })
    expect((b!.field_sources as Record<string, { source: string }>).email.source).toBe('website')
    expect(b!.opportunity_score).toBeGreaterThanOrEqual(60)
    expect((await one<{ status: string }>('SELECT status FROM audit_jobs WHERE id = $1', [claim.jobs[0].id]))!.status).toBe('done')
    // heartbeat-ul workerului rămâne vizibil și după ce jobul s-a terminat
    expect(await one('SELECT key FROM app_settings WHERE key = $1', ['worker:test'])).toBeTruthy()
    // un rezultat repetat pentru același job e ignorat (idempotent)
    expect((await (await workerResult(req('/api/crm/worker/result', { method: 'POST', headers: W, json: { job_id: claim.jobs[0].id, ok: true, facts } }))).json()).ignored).toBeTruthy()
  })

  it('treats a first failure as unverified and schedules a recheck', async () => {
    const id = await seed()
    const [job] = await claimJobs('w', 1)
    await workerResult(req('/api/crm/worker/result', { method: 'POST', headers: W, json: { job_id: job.id, ok: true, facts: { reachable: false, error_kind: 'dns' } } }))
    expect((await one<{ website_status: string }>('SELECT website_status FROM businesses WHERE id = $1', [id]))!.website_status).toBe('UNVERIFIED')
    const recheck = await one<{ run_after: string }>(`SELECT run_after FROM audit_jobs WHERE status = 'pending' AND business_id = $1`, [id])
    expect(new Date(recheck!.run_after).getTime()).toBeGreaterThan(Date.now() + 6 * 3600_000)
  })

  it('retries on worker processing errors', async () => {
    await seed()
    const [job] = await claimJobs('w', 1)
    const r = await (await workerResult(req('/api/crm/worker/result', { method: 'POST', headers: W, json: { job_id: job.id, ok: false, error: 'browser crashed' } }))).json()
    expect(r.state).toBe('pending')
  })

  it('saves a website found on a likely domain and re-audits it', async () => {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 5 }, mockPlaces([[place('n1')]]))
    const [job] = await claimJobs('w', 1)
    await workerResult(req('/api/crm/worker/result', { method: 'POST', headers: W, json: { job_id: job.id, ok: true, facts: { reachable: false, presence: { checked: true, candidates: ['biz-n1.co.uk'], found_url: 'https://biz-n1.co.uk' } } } }))
    const b = await one<BusinessRow>(`SELECT * FROM businesses WHERE google_place_id = 'n1'`)
    expect(b!.website_url).toBe('https://biz-n1.co.uk')
    expect((await q(`SELECT id FROM audit_jobs WHERE status = 'pending'`)).length).toBe(1)
  })
})

describe('CRM API', () => {
  async function seedLeads() {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 10 }, mockPlaces([[place('l1'), place('l2', { rating: 3.9 }), place('l3', { websiteUri: 'https://facebook.com/l3' })]]))
    return (await q<{ id: string; google_place_id: string }>('SELECT id, google_place_id FROM businesses ORDER BY google_place_id'))
  }

  it('lists, filters, tags and exports leads', async () => {
    const rows = await seedLeads()
    const all = await (await leadsGet(req('/api/crm/leads?page_size=10'))).json()
    expect(all.total).toBe(3)
    const filtered = await (await leadsGet(req('/api/crm/leads?min_rating=4.5'))).json()
    expect(filtered.total).toBe(2)
    await leadsPost(req('/api/crm/leads', { method: 'POST', json: { ids: [rows[0].id, rows[1].id], action: 'tag', value: 'Priority' } }))
    const tagged = await (await leadsGet(req('/api/crm/leads?tag=priority'))).json()
    expect(tagged.total).toBe(2)
    expect(tagged.facets.tags).toEqual(['priority'])
  })

  it('moves stages with history, records contact + follow-ups, and handles opt-out', async () => {
    const [lead] = await seedLeads()
    const ctx = { params: { id: lead.id } }
    await leadPatch(req(`/api/crm/leads/${lead.id}`, { method: 'PATCH', json: { stage: 'qualified', deal_value: 499, subscriber_type: 'corporate' } }), ctx)
    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'contacted', channel: 'email', schedule_follow_ups: true } }), ctx)
    const detail = await (await leadGet(req('/x'), ctx)).json()
    expect(detail.business.stage).toBe('contacted')
    expect(detail.stages.map((s: { to_stage: string }) => s.to_stage)).toEqual(['contacted', 'qualified', 'new_lead'])
    expect(detail.tasks.filter((t: { status: string }) => t.status === 'open')).toHaveLength(3)
    expect(detail.compliance.email.level).toBe('warning') // fără bază legală înregistrată

    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'reply', reply_status: 'positive' } }), ctx)
    const afterReply = await (await leadGet(req('/x'), ctx)).json()
    expect(afterReply.business.stage).toBe('interested')
    expect(afterReply.tasks.filter((t: { status: string }) => t.status === 'open')).toHaveLength(0)

    await eventsPost(req('/x', { method: 'POST', json: { event_type: 'opt_out' } }), ctx)
    const afterOpt = await (await leadGet(req('/x'), ctx)).json()
    expect(afterOpt.suppressed).toBe(true)
    expect(afterOpt.compliance.email.allowed).toBe(false)
  })

  it('creates proposals with editable items and totals', async () => {
    const [lead] = await seedLeads()
    const { id } = await (await proposalCreate(req('/x', { method: 'POST', json: { business_id: lead.id, service_keys: ['pro_site', 'maintenance'] } }))).json()
    let p = await (await proposalGet(req('/x'), { params: { id } })).json()
    expect(Number(p.proposal.total)).toBe(499) // mentenanța lunară nu intră în total
    await proposalPatch(req('/x', { method: 'PATCH', json: { status: 'sent', items: [{ description: 'Basic website', quantity: 1, unit_price: 299 }, { description: 'Local SEO', quantity: 1, unit_price: 149 }] } }), { params: { id } })
    p = await (await proposalGet(req('/x'), { params: { id } })).json()
    expect(Number(p.proposal.total)).toBe(448)
    expect((await one<{ stage: string }>('SELECT stage FROM businesses WHERE id = $1', [lead.id]))!.stage).toBe('proposal_sent')
  })

  it('deletes a lead and suppresses it on request', async () => {
    const [lead] = await seedLeads()
    await leadDelete(req(`/x?suppress=1`, { method: 'DELETE' }), { params: { id: lead.id } })
    expect(await one('SELECT id FROM businesses WHERE id = $1', [lead.id])).toBeNull()
    expect((await q(`SELECT kind FROM suppression_list WHERE kind = 'place'`)).length).toBe(1)
  })

  it('returns real dashboard and report numbers, and empty states', async () => {
    const empty = await (await dashboardGet()).json()
    expect(empty.kpis.total).toBe(0)
    await seedLeads()
    const d = await (await dashboardGet()).json()
    expect(d.kpis).toMatchObject({ total: 3, today: 3 })
    expect(d.daily).toHaveLength(30)
    const rep = await (await reportsGet(req('/api/crm/reports'))).json()
    expect(rep.summary.leads).toBe(3)
    expect(rep.byCategory[0]).toEqual({ key: 'plumber', n: 3 })
    const csv = await (await reportsGet(req('/api/crm/reports?format=csv'))).text()
    expect(csv).toContain('"summary","leads","3"')
  })

  it('shows a setup error when Google is not configured', async () => {
    const key = process.env.GOOGLE_PLACES_API_KEY
    delete process.env.GOOGLE_PLACES_API_KEY
    const r = await discoveryPost(req('/x', { method: 'POST', json: { city: 'Birmingham', category: 'plumber' } }))
    expect(r.status).toBe(503)
    process.env.GOOGLE_PLACES_API_KEY = key
  })
})

describe('AI assistant', () => {
  const fakeClient = (output: Record<string, unknown>) => {
    const create = vi.fn(async () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(output) }], stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, model: 'claude-opus-5-5' }))
    return { client: { beta: { messages: { create } } } as never, create }
  }

  it('requires configuration instead of pretending', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await aiPost(req('/x', { method: 'POST', json: { kind: 'reply', reply_text: 'Not interested thanks' } }))
    expect(r.status).toBe(503)
  })

  it('uses the Claude key from the app Settings page when Vercel has none', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(runAi('reply', { extra: { REPLY: 'hi' } })).rejects.toThrow(/Setări|ANTHROPIC_API_KEY/)
    const r = await aiPost(req('/x', { method: 'POST', headers: { 'x-anthropic-key': 'sk-ant-browser' }, json: { kind: 'reply', reply_text: 'Not now' } }))
    expect(r.status).not.toBe(503) // cheia a fost acceptată (apelul real e blocat în teste)
  })

  it('caches identical requests, logs usage and cost, and rate-limits', async () => {
    await runDiscovery({ city: 'Birmingham', category: 'plumber', limit: 1 }, mockPlaces([[place('ai1')]]))
    const b = (await one<BusinessRow>('SELECT * FROM businesses'))!
    const { client, create } = fakeClient({ action: 'Call', reason: 'r', reason_ro: 'r', suggested_stage: 'ready_to_contact' })
    const r1 = await runAi('next_action', { business: b, client })
    const r2 = await runAi('next_action', { business: b, client })
    expect(create).toHaveBeenCalledTimes(1)
    expect(r2.cached).toBe(true)
    // claude-opus-5-5: $4 / $20 per 1M tokeni
    expect(r1.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6)
    expect(r1.model).toBe('claude-opus-5-5')
    const sent = (create.mock.calls[0] as unknown[])[0] as { model: string; output_config: { format: { type: string } }; messages: { content: string }[] }
    expect(sent.model).toBe('claude-opus-5-5')
    expect(sent.output_config.format.type).toBe('json_schema')
    expect(sent.messages[0].content).toContain('"google_review_count":40')
    expect(sent.messages[0].content).toContain('"email":"unknown"')
    await runAi('next_action', { business: b, client, force: true })
    expect(create).toHaveBeenCalledTimes(2)
    await saveSetting('limits', { ...DEFAULT_SETTINGS.limits, ai_requests_per_hour: 2 })
    await expect(runAi('next_action', { business: b, client, force: true })).rejects.toThrow(/limit/)
  })
})

describe('middleware', () => {
  const mw = (path: string, init: { method?: string; cookie?: string; origin?: string } = {}) => {
    const headers: Record<string, string> = { host: 'localhost' }
    if (init.cookie) headers.cookie = init.cookie
    if (init.origin) headers.origin = init.origin
    return middleware(new NextRequest(`http://localhost${path}`, { method: init.method || 'GET', headers }))
  }
  it('protects CRM pages and APIs, allows worker endpoints and blocks cross-origin writes', async () => {
    expect((await mw('/crm/leads')).headers.get('location')).toContain('/crm/login')
    expect((await mw('/api/crm/leads')).status).toBe(401)
    const cookie = `${SESSION_COOKIE}=${await createSession()}`
    expect((await mw('/api/crm/leads', { cookie })).status).toBe(200)
    expect((await mw('/api/crm/leads', { cookie, method: 'POST', origin: 'https://evil.example' })).status).toBe(403)
    expect((await mw('/api/crm/leads', { cookie, method: 'POST', origin: 'http://localhost' })).status).toBe(200)
    expect((await mw('/api/crm/worker/claim', { method: 'POST' })).status).toBe(200)
  })
  it('without CRM_PASSWORD the CRM is open (like the rest of the app) but still blocks cross-origin writes', async () => {
    const saved = process.env.CRM_PASSWORD
    delete process.env.CRM_PASSWORD
    try {
      expect((await mw('/crm/leads')).status).toBe(200)
      expect((await mw('/api/crm/leads')).status).toBe(200)
      expect((await mw('/crm/login')).headers.get('location')).toMatch(/\/crm$/)
      expect((await mw('/api/crm/leads', { method: 'POST', origin: 'https://evil.example' })).status).toBe(403)
    } finally { process.env.CRM_PASSWORD = saved }
  })
})
