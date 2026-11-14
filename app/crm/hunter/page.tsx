'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, useApi, ApiError, relative } from '@/lib/crm/client'
import { PageHeader, Card, Button, Field, Input, Select, Badge, ApiErrorNotice, Skeleton, Kpi, Empty } from '@/components/crm/ui'
import { Progress } from '@/components/crm/charts'
import { UK_CATEGORIES, UK_REGIONS, categoryLabel } from '@/lib/crm/constants'
import { getSettings as getAppSettings } from '@/lib/storage'

interface Run { id: number; city: string; category: string; limit: number }
interface RunResult { jobId: string; found: number; newCount: number; duplicates: number; filtered: number; stoppedReason: string; error?: string }
interface HunterInfo { jobs: Record<string, any>[]; today: number; daily_target: number; daily_max: number; configured: boolean } // eslint-disable-line @typescript-eslint/no-explicit-any

let nextId = 3

export default function HunterPage() {
  const info = useApi<HunterInfo>('/api/crm/discovery')
  // cheia Google salvată în pagina Setări a aplicației (aceeași ca la uneltele RO/HU)
  const [browserKey, setBrowserKey] = useState('')
  useEffect(() => { setBrowserKey(getAppSettings().googlePlacesApiKey || '') }, [])
  const googleReady = !!info.data?.configured || !!browserKey
  const settings = useApi<{ settings: { target_market: { region: string; cities: string[]; categories: string[]; daily_target: number } } }>('/api/crm/settings')
  const [region, setRegion] = useState('West Midlands')
  const [runs, setRuns] = useState<Run[]>([{ id: 1, city: 'Birmingham', category: 'plumber', limit: 25 }, { id: 2, city: 'Wolverhampton', category: 'electrician', limit: 25 }])
  const [minRating, setMinRating] = useState('')
  const [minReviews, setMinReviews] = useState('5')
  const [websiteFilter, setWebsiteFilter] = useState('any')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<number, RunResult | { error: string } | 'running'>>({})
  const [err, setErr] = useState<ApiError | null>(null)

  // valorile implicite din Setări → Target market
  useEffect(() => {
    const t = settings.data?.settings.target_market
    if (!t) return
    setRegion(t.region)
    // ex. 2 orașe × 2 categorii, țintă 50 → Birmingham·Plumbers 25 + Wolverhampton·Electricians 25
    const n = Math.max(t.cities.length, t.categories.length, 1)
    const per = Math.min(60, Math.max(1, Math.round(t.daily_target / n)))
    const list: Run[] = Array.from({ length: n }, (_, i) => ({ id: nextId++, city: t.cities[i % t.cities.length] || 'Birmingham', category: t.categories[i % t.categories.length] || 'plumber', limit: per }))
    if (list.length) setRuns(list)
  }, [settings.data])

  const cities = UK_REGIONS[region] || []
  const update = (id: number, patch: Partial<Run>) => setRuns(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))

  async function discover() {
    setRunning(true); setErr(null); setResults({})
    for (const r of runs) {
      setResults(s => ({ ...s, [r.id]: 'running' }))
      try {
        const res = await api<RunResult>('/api/crm/discovery', { json: { city: r.city, region, category: r.category, limit: r.limit, min_rating: minRating, min_reviews: minReviews, website_filter: websiteFilter, google_api_key: info.data?.configured ? undefined : browserKey } })
        setResults(s => ({ ...s, [r.id]: res }))
        if (res.stoppedReason === 'daily_limit') break
      } catch (e) {
        setResults(s => ({ ...s, [r.id]: { error: e instanceof Error ? e.message : String(e) } }))
        if (e instanceof ApiError && e.setup) { setErr(e); break }
      }
    }
    setRunning(false)
    info.reload()
  }

  const totals = Object.values(results).reduce((t, r) => (typeof r === 'object' && 'newCount' in r ? { found: t.found + r.found, added: t.added + r.newCount, dups: t.dups + r.duplicates, filtered: t.filtered + r.filtered } : t), { found: 0, added: 0, dups: 0, filtered: 0 })
  const totalRequested = runs.reduce((s, r) => s + r.limit, 0)

  return (
    <>
      <PageHeader title="Business Hunter AI" subtitle="Discover UK trades from Google Places (official API), skip duplicates, and queue a website audit for every new lead."
        actions={info.data && <div className="w-56"><div className="flex justify-between text-[11px] text-slate-500 mb-1"><span>Today</span><span>{info.data.today} / {info.data.daily_target} target</span></div><Progress value={info.data.today} max={info.data.daily_target} /></div>} />

      {info.error && <div className="mb-4"><ApiErrorNotice error={info.error} onRetry={info.reload} /></div>}
      {info.data && !googleReady && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>No Google Places key found.</b> Add it in the app <Link href="/settings" className="underline">Setări</Link> page (the same key the Romanian/Hungarian tools use) or as <code>GOOGLE_PLACES_API_KEY</code> in Vercel.
        </div>
      )}
      {err && <div className="mb-4"><ApiErrorNotice error={err} /></div>}

      <div className="grid xl:grid-cols-[1fr_340px] gap-4">
        <Card title="Search configuration">
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <Field label="Country"><Select disabled><option>United Kingdom</option></Select></Field>
            <Field label="Region"><Select value={region} onChange={e => setRegion(e.target.value)}>{Object.keys(UK_REGIONS).map(r => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Min. Google rating"><Select value={minRating} onChange={e => setMinRating(e.target.value)}><option value="">Any</option>{[3.5, 4, 4.3, 4.5].map(v => <option key={v} value={v}>{v}+</option>)}</Select></Field>
            <Field label="Min. reviews"><Select value={minReviews} onChange={e => setMinReviews(e.target.value)}><option value="">Any</option>{[1, 5, 10, 20, 50].map(v => <option key={v} value={v}>{v}+</option>)}</Select></Field>
            <Field label="Website (from Google profile)" hint="Not a final verdict — the audit verifies it">
              <Select value={websiteFilter} onChange={e => setWebsiteFilter(e.target.value)}>
                <option value="any">Any</option><option value="no_website">No website listed</option><option value="has_website">Has a website listed</option>
              </Select>
            </Field>
          </div>

          <div className="text-[12px] font-medium text-slate-600 mb-2">Search runs (city → category → number of new leads)</div>
          <div className="space-y-2">
            {runs.map(r => {
              const res = results[r.id]
              return (
                <div key={r.id} className="grid grid-cols-[1fr_1fr_90px_auto] sm:grid-cols-[1fr_1fr_100px_1fr_auto] items-center gap-2">
                  <Select value={r.city} onChange={e => update(r.id, { city: e.target.value })}>
                    {Array.from(new Set([r.city, ...cities])).map(c => <option key={c}>{c}</option>)}
                  </Select>
                  <Select value={r.category} onChange={e => update(r.id, { category: e.target.value })}>{UK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>
                  <Input type="number" min={1} max={60} value={r.limit} onChange={e => update(r.id, { limit: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
                  <div className="hidden sm:block text-xs">
                    {res === 'running' ? <span className="text-slate-500">Searching…</span>
                      : res && 'error' in res ? <span className="text-rose-700">{res.error}</span>
                        : res ? <span className="text-slate-600"><b className="text-teal-700">{res.newCount} new</b> · {res.duplicates} duplicates · {res.filtered} filtered{res.stoppedReason === 'daily_limit' ? ' · daily limit reached' : ''}</span> : null}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setRuns(rs => rs.filter(x => x.id !== r.id))} disabled={runs.length === 1} aria-label="Remove">✕</Button>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button size="sm" onClick={() => setRuns(rs => [...rs, { id: nextId++, city: cities[0] || 'Birmingham', category: 'heating_engineer', limit: 10 }])}>+ Add city / category</Button>
            <span className="flex-1" />
            <span className="text-xs text-slate-500">Up to {totalRequested} new leads · max {info.data?.daily_max ?? '—'} per day</span>
            <Button variant="primary" onClick={discover} loading={running} disabled={!googleReady}>Discover businesses</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Found" value={totals.found} />
            <Kpi label="New saved" value={totals.added} emphasis />
            <Kpi label="Duplicates skipped" value={totals.dups} />
            <Kpi label="Filtered out" value={totals.filtered} hint="closed, rating, reviews" />
          </div>
          <Card title="How it works">
            <ol className="text-[13px] text-slate-600 space-y-1.5 list-decimal pl-4">
              <li>Google Places Text Search (max. 60 results per query), then Place Details for phone and website — only for new businesses that pass your filters.</li>
              <li>Duplicates are matched by Place ID, website domain and phone; name + postcode matches are flagged, not merged.</li>
              <li>Each new lead gets a website audit job. The Python worker checks the site, WhatsApp links and PageSpeed.</li>
              <li>The opportunity score is calculated from verified evidence only.</li>
            </ol>
          </Card>
        </div>
      </div>

      <Card title="Recent discovery runs" className="mt-4" pad={false}>
        {info.loading ? <div className="p-4"><Skeleton /></div> : !info.data?.jobs.length ? <Empty title="No runs yet">Configure your search above and press Discover businesses.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-medium">When</th><th className="px-2 font-medium">Search</th><th className="px-2 font-medium">Found</th><th className="px-2 font-medium">New</th><th className="px-2 font-medium">Duplicates</th><th className="px-2 font-medium">Filtered</th><th className="px-4 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {info.data.jobs.map(j => (
                  <tr key={j.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{relative(j.created_at)}</td>
                    <td className="px-2">{categoryLabel(j.category)} · {j.city}</td>
                    <td className="px-2 tabular-nums">{j.found}</td>
                    <td className="px-2 tabular-nums font-medium text-teal-700">{j.new_count}</td>
                    <td className="px-2 tabular-nums">{j.duplicates}</td>
                    <td className="px-2 tabular-nums">{j.filtered}</td>
                    <td className="px-4">{j.status === 'failed' ? <span className="inline-flex flex-col items-start gap-0.5"><Badge tone="bad" title={j.error}>Failed</Badge>{j.error && <span className="text-[11px] text-rose-700 max-w-[260px] whitespace-normal">{j.error}</span>}</span> : j.status === 'done' ? <Badge tone="good">Done</Badge> : <Badge>{j.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11px] text-slate-400 mt-3">Business data from Google Places is shown with its source and is refreshed or cleared according to the retention period configured on the server (GOOGLE_DATA_RETENTION_DAYS). Discovery figures are actual results — not guaranteed targets.</p>
    </>
  )
}
