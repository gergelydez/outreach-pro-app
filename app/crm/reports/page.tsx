'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useApi, gbp } from '@/lib/crm/client'
import { PageHeader, Card, Kpi, Input, ApiErrorNotice, Skeleton, ScoreBadge, WebsiteBadge } from '@/components/crm/ui'
import { BarList } from '@/components/crm/charts'
import { WEBSITE_STATUS_LABEL, categoryLabel } from '@/lib/crm/constants'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export default function ReportsPage() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86400_000)))
  const [to, setTo] = useState(ymd(new Date()))
  const { data, error, loading, reload } = useApi<any>(`/api/crm/reports?from=${from}&to=${to}`)
  const s = data?.summary

  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Real CRM data for leads discovered in the selected period."
        actions={<>
          <Input type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-400">→</span>
          <Input type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} />
          <a href={`/api/crm/reports?from=${from}&to=${to}&format=csv`} className="inline-flex items-center h-9 px-3.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Export CSV</a>
        </>} />
      {error ? <ApiErrorNotice error={error} onRetry={reload} /> : loading || !s ? <Skeleton rows={8} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
            <Kpi label="Leads discovered" value={s.leads} />
            <Kpi label="High opportunity" value={s.high_opportunity} />
            <Kpi label="Contacted" value={s.contacted} />
            <Kpi label="Reply rate" value={`${s.reply_rate}%`} hint={`${s.replied} replied`} />
            <Kpi label="Interested rate" value={`${s.interested_rate}%`} hint={`${s.interested} interested`} />
            <Kpi label="Proposal rate" value={`${s.proposal_rate}%`} hint={`${s.proposals} proposals`} />
            <Kpi label="Win rate" value={`${s.win_rate}%`} hint={`${s.won} won · ${s.lost} lost`} />
            <Kpi label="Average deal" value={gbp(s.avg_deal)} />
            <Kpi label="Pipeline value" value={gbp(s.pipeline_value)} />
            <Kpi label="Revenue" value={gbp(s.revenue)} emphasis />
            <Kpi label="AI requests" value={s.ai_requests} hint={`${s.ai_tokens.toLocaleString('en-GB')} tokens`} />
            <Kpi label="Est. AI cost" value={`$${s.ai_cost.toFixed(2)}`} />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Leads by city"><BarList data={data.byCity} /></Card>
            <Card title="Leads by category"><BarList data={data.byCategory} labelFor={categoryLabel} /></Card>
            <Card title="Website status"><BarList data={data.byStatus} labelFor={k => WEBSITE_STATUS_LABEL[k] || k} /></Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Outreach performance by channel" pad={false}>
              {!data.outreach.length ? <p className="text-sm text-slate-500 p-4">No contact recorded in this period.</p> : (
                <table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2 font-medium">Channel</th><th className="text-left px-2 font-medium">Contacted</th><th className="text-left px-2 font-medium">Replies</th><th className="text-left px-4 font-medium">Reply rate</th></tr></thead>
                  <tbody>{data.outreach.map((o: any) => <tr key={o.channel} className="border-t border-slate-100"><td className="px-4 py-2 capitalize">{o.channel.replace('_', ' ')}</td><td className="px-2 tabular-nums">{o.contacted}</td><td className="px-2 tabular-nums">{o.replies}</td><td className="px-4 tabular-nums">{Number(o.contacted) ? `${Math.round((Number(o.replies) / Number(o.contacted)) * 100)}%` : '—'}</td></tr>)}</tbody></table>
              )}
            </Card>
            <Card title="High-opportunity businesses" pad={false}>
              {!data.top.length ? <p className="text-sm text-slate-500 p-4">None in this period.</p> : (
                <ul className="divide-y divide-slate-100">{data.top.map((t: any) => <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-2 text-sm"><Link href={`/crm/leads/${t.id}`} className="text-slate-800 hover:text-teal-700 truncate">{t.name} <span className="text-slate-400">· {t.city}</span></Link><span className="flex items-center gap-2"><WebsiteBadge status={t.website_status} /><ScoreBadge score={t.opportunity_score} /></span></li>)}</ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
