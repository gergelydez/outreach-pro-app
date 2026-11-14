'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, useApi, gbp, dateUk } from '@/lib/crm/client'
import { PageHeader, Card, Button, ScoreBadge, WebsiteBadge, StageBadge, ApiErrorNotice, Skeleton, Toast, cx, Select } from '@/components/crm/ui'
import { STAGES, categoryLabel } from '@/lib/crm/constants'

interface PLead { id: string; name: string; city: string; category: string; website_status: string; opportunity_score: number | null; stage: string; deal_value: string | null; next_follow_up_at: string | null }
interface Col { key: string; label: string; count: number; value: number; leads: PLead[] }

export default function PipelinePage() {
  const { data, error, loading, reload, setData } = useApi<{ columns: Col[] }>('/api/crm/pipeline')
  const [view, setView] = useState<'board' | 'table'>('board')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [hideClosed, setHideClosed] = useState(false)

  // Mutare optimistă: cardul se mută imediat, iar la eroare reîncărcăm din bază
  async function move(id: string, to: string) {
    if (!data) return
    const from = data.columns.find(c => c.leads.some(l => l.id === id))
    if (!from || from.key === to) return
    const lead = from.leads.find(l => l.id === id)!
    setData({ columns: data.columns.map(c => c.key === from.key ? { ...c, count: c.count - 1, leads: c.leads.filter(l => l.id !== id) } : c.key === to ? { ...c, count: c.count + 1, leads: [{ ...lead, stage: to }, ...c.leads] } : c) })
    try { await api(`/api/crm/leads/${id}`, { method: 'PATCH', json: { stage: to } }) }
    catch (e) { setToast(e instanceof Error ? e.message : 'Move failed'); reload() }
  }

  const cols = (data?.columns || []).filter(c => !hideClosed || !['lost', 'not_a_fit'].includes(c.key))
  const total = (data?.columns || []).filter(c => !['won', 'lost', 'not_a_fit'].includes(c.key)).reduce((s, c) => s + c.value, 0)

  return (
    <>
      <PageHeader title="Sales Pipeline" subtitle={data ? `Open pipeline value ${gbp(total)}` : 'Drag cards between stages — every move is saved with its history.'}
        actions={<>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={hideClosed} onChange={e => setHideClosed(e.target.checked)} /> Hide lost / not a fit</label>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['board', 'table'] as const).map(v => <button key={v} onClick={() => setView(v)} className={cx('px-3 h-8 rounded-md text-sm capitalize', view === v ? 'bg-slate-900 text-white' : 'text-slate-600')}>{v}</button>)}
          </div>
        </>} />
      {error ? <ApiErrorNotice error={error} onRetry={reload} /> : loading || !data ? <Skeleton rows={6} /> : view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          {cols.map(c => (
            <div key={c.key}
              onDragOver={e => { e.preventDefault(); setOver(c.key) }} onDragLeave={() => setOver(null)}
              onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) move(id, c.key) }}
              className={cx('w-64 shrink-0 rounded-xl border bg-slate-100/70 flex flex-col max-h-[calc(100vh-170px)]', over === c.key ? 'border-teal-500 bg-teal-50' : 'border-slate-200')}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-800">{c.label}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">{c.count}{c.value ? ` · ${gbp(c.value)}` : ''}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[60px]">
                {c.leads.map(l => (
                  <div key={l.id} draggable onDragStart={e => { setDragId(l.id); e.dataTransfer.setData('text/plain', l.id) }} onDragEnd={() => setDragId(null)}
                    className={cx('rounded-lg bg-white border border-slate-200 p-2.5 shadow-sm cursor-grab active:cursor-grabbing', dragId === l.id && 'opacity-50')}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/crm/leads/${l.id}`} className="text-[13px] font-medium text-slate-900 hover:text-teal-700 leading-snug">{l.name}</Link>
                      <ScoreBadge score={l.opportunity_score} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{categoryLabel(l.category)} · {l.city}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2"><WebsiteBadge status={l.website_status} />
                      {l.deal_value && <span className="text-[11px] font-medium text-slate-700">{gbp(l.deal_value)}</span>}
                      {l.next_follow_up_at && <span className={cx('text-[11px]', new Date(l.next_follow_up_at) < new Date() ? 'text-rose-700' : 'text-slate-500')}>↻ {dateUk(l.next_follow_up_at).slice(0, 6)}</span>}
                    </div>
                    {/* pe telefon drag-and-drop nu e practic: mutare din meniu */}
                    <select aria-label="Move to stage" className="lg:hidden mt-2 w-full h-7 text-[11px] rounded border border-slate-200 bg-slate-50" value={l.stage} onChange={e => move(l.id, e.target.value)}>
                      {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                ))}
                {c.count > c.leads.length && <div className="text-[11px] text-slate-500 text-center py-1">+{c.count - c.leads.length} more in All Leads</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200"><tr>
                <th className="text-left px-4 py-2 font-medium">Business</th><th className="text-left px-2 font-medium">Stage</th><th className="text-left px-2 font-medium">Website</th><th className="text-left px-2 font-medium">Score</th><th className="text-left px-2 font-medium">Deal</th><th className="text-left px-2 font-medium">Follow-up</th><th className="px-4 font-medium text-left">Move</th>
              </tr></thead>
              <tbody>
                {cols.flatMap(c => c.leads).map(l => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="px-4 py-2"><Link href={`/crm/leads/${l.id}`} className="font-medium text-slate-900 hover:text-teal-700">{l.name}</Link><div className="text-[11px] text-slate-500">{l.city}</div></td>
                    <td className="px-2"><StageBadge stage={l.stage} /></td>
                    <td className="px-2"><WebsiteBadge status={l.website_status} /></td>
                    <td className="px-2"><ScoreBadge score={l.opportunity_score} /></td>
                    <td className="px-2">{gbp(l.deal_value)}</td>
                    <td className="px-2">{l.next_follow_up_at ? dateUk(l.next_follow_up_at) : '—'}</td>
                    <td className="px-4"><Select className="h-8 text-xs" value={l.stage} onChange={e => move(l.id, e.target.value)}>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Toast message={toast} tone="bad" onClose={() => setToast(null)} />
      {data && <Button size="sm" variant="ghost" className="mt-2" onClick={reload}>Refresh</Button>}
    </>
  )
}
