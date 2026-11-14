'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, useApi, relative, dateUk } from '@/lib/crm/client'
import { PageHeader, Card, Button, Input, Select, ScoreBadge, WebsiteBadge, WhatsAppBadge, StageBadge, Empty, ApiErrorNotice, Skeleton, Toast, Badge } from '@/components/crm/ui'
import { STAGES, WEBSITE_STATUSES, WEBSITE_STATUS_LABEL, categoryLabel } from '@/lib/crm/constants'

interface Lead {
  id: string; name: string; category: string; city: string; phone: string | null; email: string | null; website_url: string | null; website_status: string
  whatsapp_status: string; google_rating: string | null; google_review_count: number | null; opportunity_score: number | null; stage: string
  last_contacted_at: string | null; next_follow_up_at: string | null; lead_source: string | null; tags: string[]; possible_duplicate_of: string | null
}
interface ListResp { rows: Lead[]; total: number; page: number; page_size: number; facets: { cities: string[]; categories: string[]; tags: string[] } }

const COLUMNS = [
  ['category', 'Category'], ['city', 'City'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['website_status', 'Website status'],
  ['whatsapp', 'WhatsApp'], ['rating', 'Rating'], ['reviews', 'Reviews'], ['score', 'Score'], ['stage', 'Stage'], ['last_contact', 'Last contact'],
  ['follow_up', 'Next follow-up'], ['source', 'Source'],
] as const
type ColKey = typeof COLUMNS[number][0]
const DEFAULT_COLS: ColKey[] = ['category', 'city', 'phone', 'website_status', 'whatsapp', 'rating', 'reviews', 'score', 'stage', 'follow_up']
const FILTER_KEYS = ['q', 'city', 'category', 'website_status', 'whatsapp', 'stage', 'min_score', 'min_rating', 'min_reviews', 'contacted', 'tag', 'from', 'to', 'sort']

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

function LeadsInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS)
  const [saved, setSaved] = useState<{ name: string; query: string }[]>([])
  const [showCols, setShowCols] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [bulkTag, setBulkTag] = useState('')
  const [search, setSearch] = useState(sp.get('q') || '')

  useEffect(() => { setCols(ls.get('crm_lead_cols', DEFAULT_COLS)); setSaved(ls.get('crm_saved_filters', [])) }, [])

  const filterQs = useMemo(() => {
    const p = new URLSearchParams()
    FILTER_KEYS.forEach(k => { const v = sp.get(k); if (v) p.set(k, v) })
    return p.toString()
  }, [sp])
  const { data, error, loading, reload } = useApi<ListResp>(`/api/crm/leads?${filterQs}&page=${page}&page_size=25`)
  useEffect(() => { setPage(1); setSelected(new Set()) }, [filterQs])

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(filterQs)
    if (v) p.set(k, v); else p.delete(k)
    router.replace(`/crm/leads?${p.toString()}`)
  }
  useEffect(() => { const t = setTimeout(() => { if ((sp.get('q') || '') !== search) setFilter('q', search) }, 350); return () => clearTimeout(t) }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const show = (c: ColKey) => cols.includes(c)
  const toggleCol = (c: ColKey) => { const next = show(c) ? cols.filter(x => x !== c) : [...cols, c]; setCols(next); ls.set('crm_lead_cols', next) }
  const allChecked = !!data?.rows.length && data.rows.every(r => selected.has(r.id))

  async function bulk(action: string, value?: string) {
    if (!selected.size) return
    if (action === 'delete' && !confirm(`Permanently delete ${selected.size} lead(s)? This cannot be undone.`)) return
    try {
      await api('/api/crm/leads', { json: { ids: Array.from(selected), action, value } })
      setToast(`${action === 'delete' ? 'Deleted' : 'Updated'} ${selected.size} lead(s)`)
      setSelected(new Set()); reload()
    } catch (e) { setToast(e instanceof Error ? e.message : 'Failed') }
  }

  function saveFilter() {
    const name = prompt('Name this filter (e.g. "Birmingham — no website")')
    if (!name) return
    const next = [...saved.filter(s => s.name !== name), { name, query: filterQs }]
    setSaved(next); ls.set('crm_saved_filters', next)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const th = 'px-2 py-2 font-medium text-left whitespace-nowrap'

  return (
    <>
      <PageHeader title="All Leads" subtitle={data ? `${data.total} businesses` : 'CRM database'}
        actions={<>
          <a href={`/api/crm/leads/export?${filterQs}`} className="inline-flex items-center h-9 px-3.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Export CSV</a>
          <Button onClick={saveFilter}>Save filter</Button>
        </>} />

      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 pt-2">
          <Input placeholder="Search name, address, phone…" value={search} onChange={e => setSearch(e.target.value)} className="col-span-2" />
          <Select value={sp.get('city') || ''} onChange={e => setFilter('city', e.target.value)}><option value="">All cities</option>{data?.facets.cities.map(c => <option key={c}>{c}</option>)}</Select>
          <Select value={sp.get('category') || ''} onChange={e => setFilter('category', e.target.value)}><option value="">All categories</option>{data?.facets.categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select>
          <Select value={sp.get('website_status') || ''} onChange={e => setFilter('website_status', e.target.value)}><option value="">Any website status</option>{WEBSITE_STATUSES.map(s => <option key={s} value={s}>{WEBSITE_STATUS_LABEL[s]}</option>)}</Select>
          <Select value={sp.get('stage') || ''} onChange={e => setFilter('stage', e.target.value)}><option value="">Any stage</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
          <Select value={sp.get('min_score') || ''} onChange={e => setFilter('min_score', e.target.value)}><option value="">Any score</option><option value="80">Excellent (80+)</option><option value="60">High (60+)</option><option value="40">Medium (40+)</option></Select>
          <Select value={sp.get('sort') || 'score'} onChange={e => setFilter('sort', e.target.value)}>
            <option value="score">Sort: score</option><option value="newest">Newest</option><option value="name">Name</option><option value="rating">Rating</option><option value="reviews">Reviews</option><option value="follow_up">Next follow-up</option><option value="last_contact">Last contact</option>
          </Select>
          <Select value={sp.get('whatsapp') || ''} onChange={e => setFilter('whatsapp', e.target.value)}><option value="">WhatsApp: any</option><option value="FOUND">Link found</option><option value="NOT_FOUND">No link detected</option><option value="UNVERIFIED">Unverified</option></Select>
          <Select value={sp.get('min_rating') || ''} onChange={e => setFilter('min_rating', e.target.value)}><option value="">Any rating</option>{['4', '4.5'].map(v => <option key={v} value={v}>{v}+ ★</option>)}</Select>
          <Select value={sp.get('min_reviews') || ''} onChange={e => setFilter('min_reviews', e.target.value)}><option value="">Any reviews</option>{['10', '20', '50'].map(v => <option key={v} value={v}>{v}+ reviews</option>)}</Select>
          <Select value={sp.get('contacted') || ''} onChange={e => setFilter('contacted', e.target.value)}><option value="">Contacted: any</option><option value="no">Not contacted</option><option value="yes">Contacted</option></Select>
          <Select value={sp.get('tag') || ''} onChange={e => setFilter('tag', e.target.value)}><option value="">Any tag</option>{data?.facets.tags.map(t => <option key={t}>{t}</option>)}</Select>
          <Input type="date" value={sp.get('from') || ''} onChange={e => setFilter('from', e.target.value)} title="Discovered from" />
          <Input type="date" value={sp.get('to') || ''} onChange={e => setFilter('to', e.target.value)} title="Discovered to" />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          {saved.map(s => (
            <span key={s.name} className="inline-flex items-center gap-1 rounded-md bg-slate-100 pl-2 pr-1 py-0.5">
              <button className="text-slate-700 hover:text-teal-700" onClick={() => router.replace(`/crm/leads?${s.query}`)}>{s.name}</button>
              <button className="text-slate-400 hover:text-rose-600 px-1" onClick={() => { const n = saved.filter(x => x.name !== s.name); setSaved(n); ls.set('crm_saved_filters', n) }}>✕</button>
            </span>
          ))}
          {filterQs && <button className="text-teal-700 font-medium" onClick={() => { setSearch(''); router.replace('/crm/leads') }}>Clear filters</button>}
          <span className="flex-1" />
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setShowCols(v => !v)}>Columns</Button>
            {showCols && (
              <div className="absolute right-0 mt-1 z-20 w-48 bg-white border border-slate-200 rounded-lg shadow-lg p-2 space-y-1">
                {COLUMNS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={show(k)} onChange={() => toggleCol(k)} /> {l}</label>)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-12 lg:top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <select className="h-8 rounded-md bg-slate-800 border border-slate-700 px-2 text-sm" defaultValue="" onChange={e => { if (e.target.value) bulk('stage', e.target.value); e.target.value = '' }}>
            <option value="">Move to stage…</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input className="h-8 w-32 rounded-md bg-slate-800 border border-slate-700 px-2 text-sm" placeholder="tag" value={bulkTag} onChange={e => setBulkTag(e.target.value)} />
          <button className="h-8 px-2.5 rounded-md bg-slate-700 hover:bg-slate-600" onClick={() => bulkTag && bulk('tag', bulkTag)}>Add tag</button>
          <button className="h-8 px-2.5 rounded-md bg-slate-700 hover:bg-slate-600" onClick={() => bulk('reaudit')}>Re-audit</button>
          <button className="h-8 px-2.5 rounded-md bg-rose-700 hover:bg-rose-600" onClick={() => bulk('delete')}>Delete</button>
          <span className="flex-1" />
          <button className="text-slate-400 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card pad={false}>
        {error ? <div className="p-4"><ApiErrorNotice error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={8} /></div> : !data?.rows.length ? (
          <Empty title={filterQs ? 'No leads match these filters' : 'No leads yet'} action={!filterQs && <Link href="/crm/hunter" className="text-sm font-medium text-teal-700">Discover businesses →</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="pl-4 pr-1 py-2 w-8"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(data.rows.map(r => r.id)))} aria-label="Select all" /></th>
                  <th className={th}>Business</th>
                  {COLUMNS.filter(([k]) => show(k)).map(([k, l]) => <th key={k} className={th}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="pl-4 pr-1 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => { const n = new Set(selected); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelected(n) }} aria-label={`Select ${r.name}`} /></td>
                    <td className="px-2 py-2 min-w-[180px]">
                      <Link href={`/crm/leads/${r.id}`} className="font-medium text-slate-900 hover:text-teal-700">{r.name}</Link>
                      <div className="flex gap-1 mt-0.5">{r.possible_duplicate_of && <Badge tone="warn">Possible duplicate</Badge>}{r.tags.slice(0, 3).map(t => <Badge key={t}>{t}</Badge>)}</div>
                    </td>
                    {show('category') && <td className="px-2 text-slate-600 whitespace-nowrap">{categoryLabel(r.category)}</td>}
                    {show('city') && <td className="px-2 text-slate-600">{r.city}</td>}
                    {show('phone') && <td className="px-2 whitespace-nowrap">{r.phone ? <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="text-slate-700 hover:text-teal-700">{r.phone}</a> : <span className="text-slate-400">—</span>}</td>}
                    {show('email') && <td className="px-2 text-slate-600 max-w-[180px] truncate">{r.email || <span className="text-slate-400">—</span>}</td>}
                    {show('website') && <td className="px-2 max-w-[160px] truncate">{r.website_url ? <a href={r.website_url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">{r.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> : <span className="text-slate-400">—</span>}</td>}
                    {show('website_status') && <td className="px-2"><WebsiteBadge status={r.website_status} /></td>}
                    {show('whatsapp') && <td className="px-2"><WhatsAppBadge status={r.whatsapp_status} /></td>}
                    {show('rating') && <td className="px-2 tabular-nums">{r.google_rating ? `${Number(r.google_rating).toFixed(1)} ★` : '—'}</td>}
                    {show('reviews') && <td className="px-2 tabular-nums">{r.google_review_count ?? '—'}</td>}
                    {show('score') && <td className="px-2"><ScoreBadge score={r.opportunity_score} /></td>}
                    {show('stage') && <td className="px-2"><StageBadge stage={r.stage} /></td>}
                    {show('last_contact') && <td className="px-2 text-slate-500 whitespace-nowrap">{relative(r.last_contacted_at)}</td>}
                    {show('follow_up') && <td className={`px-2 whitespace-nowrap ${r.next_follow_up_at && new Date(r.next_follow_up_at) < new Date() ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>{r.next_follow_up_at ? dateUk(r.next_follow_up_at) : '—'}</td>}
                    {show('source') && <td className="px-2 text-slate-500">{r.lead_source || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.page_size && (
          <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-600 border-t border-slate-100">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2"><Button size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
          </div>
        )}
      </Card>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}

export default function LeadsPage() {
  return <Suspense fallback={<Skeleton rows={8} />}><LeadsInner /></Suspense>
}
