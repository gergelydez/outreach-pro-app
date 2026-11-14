'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, useApi, gbp, dateUk } from '@/lib/crm/client'
import { PageHeader, Card, Button, Field, Input, Textarea, Select, ApiErrorNotice, Skeleton, Toast, Badge } from '@/components/crm/ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Item { description: string; quantity: number; unit_price: number; recurring: string | null }

export default function ProposalPage({ params }: { params: { id: string } }) {
  const { data, error, loading, reload } = useApi<any>(`/api/crm/proposals/${params.id}`)
  const [p, setP] = useState<any>(null)
  const [items, setItems] = useState<Item[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!data) return
    setP(data.proposal)
    setItems(data.items.map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), recurring: i.recurring })))
  }, [data])

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />
  if (loading || !p) return <Skeleton rows={8} />

  const oneOff = items.filter(i => !i.recurring).reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const monthly = items.filter(i => i.recurring === 'monthly').reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const save = async (extra: Record<string, unknown> = {}, msg = 'Saved') => {
    setBusy(true)
    try { await api(`/api/crm/proposals/${params.id}`, { method: 'PATCH', json: { title: p.title, intro: p.intro, scope: p.scope, timeline: p.timeline, terms: p.terms, items, ...extra } }); setToast(msg); reload() }
    catch (e) { setToast(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }
  const seller = data.seller

  return (
    <>
      <div className="print:hidden">
        <Link href={`/crm/leads/${p.business_id}`} className="text-xs text-slate-500 hover:text-teal-700">← {p.business_name}</Link>
        <PageHeader title="Proposal" subtitle={<>Status <Badge tone={p.status === 'accepted' ? 'good' : p.status === 'sent' ? 'info' : 'neutral'}>{p.status}</Badge></>}
          actions={<>
            <Button onClick={() => save()} loading={busy}>Save</Button>
            <Button onClick={async () => { await save(); setTimeout(() => window.print(), 300) }}>Export PDF</Button>
            {p.status === 'draft' && <Button variant="primary" onClick={() => save({ status: 'sent' }, 'Marked as sent — stage moved to Proposal Sent')}>Mark as sent</Button>}
            {p.status === 'sent' && <><Button onClick={() => save({ status: 'declined' }, 'Marked as declined')}>Declined</Button><Button variant="primary" onClick={() => save({ status: 'accepted' }, 'Accepted — lead moved to Won')}>Accepted</Button></>}
          </>} />
      </div>

      <div className="grid xl:grid-cols-[1fr_minmax(0,620px)] gap-4 items-start print:block">
        <div className="space-y-4 print:hidden">
          <Card title="Content">
            <div className="space-y-3">
              <Field label="Title"><Input value={p.title} onChange={e => setP({ ...p, title: e.target.value })} /></Field>
              <Field label="Introduction"><Textarea rows={5} value={p.intro || ''} onChange={e => setP({ ...p, intro: e.target.value })} /></Field>
              <Field label="Scope of work"><Textarea rows={6} value={p.scope || ''} onChange={e => setP({ ...p, scope: e.target.value })} /></Field>
              <Field label="Estimated delivery / timeline" hint="Only commit to what you can deliver"><Input value={p.timeline || ''} onChange={e => setP({ ...p, timeline: e.target.value })} /></Field>
              <Field label="Terms" hint="Write your own terms — the app does not generate legal terms or guarantees"><Textarea rows={4} value={p.terms || ''} onChange={e => setP({ ...p, terms: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Line items">
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_100px_auto] gap-2 items-center">
                  <Input value={it.description} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  <Input type="number" min={0} value={it.quantity} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <Input type="number" min={0} value={it.unit_price} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
                  <Select value={it.recurring || ''} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, recurring: e.target.value || null } : x))}><option value="">One-off</option><option value="monthly">Monthly</option></Select>
                  <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Select className="w-60" value="" onChange={e => { const sv = data.services.find((x: any) => x.key === e.target.value); if (sv) setItems([...items, { description: sv.label, quantity: 1, unit_price: sv.price, recurring: sv.recurring || null }]) }}>
                  <option value="">+ Add a service…</option>{data.services.map((sv: any) => <option key={sv.key} value={sv.key}>{sv.label} — {gbp(sv.price)}{sv.recurring ? '/mo' : ''}</option>)}
                </Select>
                <Button size="sm" onClick={() => setItems([...items, { description: 'Custom item', quantity: 1, unit_price: 0, recurring: null }])}>+ Custom item</Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Previzualizare = documentul exportat (Print → Save as PDF) */}
        <article className="bg-white border border-slate-200 rounded-xl p-8 text-slate-800 text-[14px] leading-relaxed print:border-0 print:p-0 print:rounded-none shadow-sm print:shadow-none">
          <header className="flex justify-between gap-4 border-b border-slate-200 pb-4 mb-5">
            <div><div className="text-lg font-semibold text-slate-900">{seller.company_name || seller.sender_name || 'Your company'}</div><div className="text-xs text-slate-500">{[seller.business_email, seller.website].filter(Boolean).join(' · ')}</div></div>
            <div className="text-right text-xs text-slate-500">Prepared for<div className="text-sm font-medium text-slate-900">{p.business_name}</div>{p.business_city}<div>{dateUk(new Date().toISOString())}</div></div>
          </header>
          <h1 className="text-xl font-semibold text-slate-900 mb-3">{p.title}</h1>
          {p.intro && <p className="whitespace-pre-wrap mb-4">{p.intro}</p>}
          {p.scope && <><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">Scope</h2><p className="whitespace-pre-wrap mb-4">{p.scope}</p></>}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">Investment</h2>
          <table className="w-full text-sm mb-2">
            <tbody>
              {items.map((it, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1.5">{it.description}{it.quantity !== 1 ? ` × ${it.quantity}` : ''}</td><td className="py-1.5 text-right tabular-nums whitespace-nowrap">{gbp(it.quantity * it.unit_price)}{it.recurring ? ' / month' : ''}</td></tr>)}
            </tbody>
          </table>
          <div className="flex justify-end gap-6 text-sm mb-4"><span>Total (one-off): <b className="tabular-nums">{gbp(oneOff)}</b></span>{monthly > 0 && <span>Monthly: <b className="tabular-nums">{gbp(monthly)}</b></span>}</div>
          {p.timeline && <><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">Timeline</h2><p className="mb-4">{p.timeline}</p></>}
          {p.terms && <><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">Terms</h2><p className="whitespace-pre-wrap text-xs text-slate-600">{p.terms}</p></>}
        </article>
      </div>
      <style>{`@media print { @page { margin: 16mm } body { background: #fff !important } aside, header.lg\\:hidden { display: none !important } .lg\\:pl-60 { padding-left: 0 !important } main { padding: 0 !important; max-width: none !important } }`}</style>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}
