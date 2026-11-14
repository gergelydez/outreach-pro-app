'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, useApi, dateUk, relative } from '@/lib/crm/client'
import { PageHeader, Card, Badge, Select, ApiErrorNotice, Skeleton, Empty, Toast, Kpi } from '@/components/crm/ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function OutreachPage() {
  const [status, setStatus] = useState('draft')
  const [channel, setChannel] = useState('')
  const { data, error, loading, reload } = useApi<any>(`/api/crm/outreach?status=${status}${channel ? `&channel=${channel}` : ''}`)
  const [toast, setToast] = useState<string | null>(null)

  async function markSent(m: any) {
    try { await api(`/api/crm/leads/${m.business_id}/outreach`, { method: 'PATCH', json: { message_id: m.id, status: 'sent' } }); setToast('Marked as sent'); reload() }
    catch (e) { setToast(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <>
      <PageHeader title="Outreach & Messages" subtitle="Drafts are prepared for you. You review, send them yourself, and record the outcome — nothing is sent automatically." />
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
          <Kpi label="Drafts" value={data.counts.draft || 0} /><Kpi label="Sent manually" value={data.counts.sent || 0} /><Kpi label="Archived" value={data.counts.archived || 0} />
        </div>
      )}
      <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
        <Card title="Messages" action={<div className="flex gap-2">
          <Select className="h-8 w-32 text-xs" value={status} onChange={e => setStatus(e.target.value)}><option value="draft">Drafts</option><option value="sent">Sent</option><option value="archived">Archived</option></Select>
          <Select className="h-8 w-36 text-xs" value={channel} onChange={e => setChannel(e.target.value)}><option value="">All channels</option>{['email', 'whatsapp', 'contact_form', 'linkedin'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</Select>
        </div>}>
          {error ? <ApiErrorNotice error={error} onRetry={reload} /> : loading || !data ? <Skeleton /> : !data.messages.length ? (
            <Empty title={status === 'draft' ? 'No drafts' : 'Nothing here yet'}>Open a lead, go to the AI tab and generate personalised messages, then save them as drafts.</Empty>
          ) : (
            <div className="space-y-2">
              {data.messages.map((m: any) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs mb-1.5">
                    <Link href={`/crm/leads/${m.business_id}`} className="text-sm font-medium text-slate-900 hover:text-teal-700">{m.business_name}</Link>
                    <span className="text-slate-400">{m.city}</span>
                    <Badge tone="info">{m.channel.replace('_', ' ')}</Badge>
                    {m.source === 'ai' && <Badge>AI draft</Badge>}
                    {m.channel === 'email' && m.subscriber_type !== 'corporate' && <Badge tone="warn" title="PECR: individual subscribers need consent for marketing email">Check consent</Badge>}
                    <span className="flex-1" />
                    <span className="text-slate-400">{m.status === 'sent' ? `sent ${dateUk(m.sent_at, true)}` : relative(m.updated_at)}</span>
                  </div>
                  {m.subject && <div className="text-xs text-slate-500">Subject: {m.subject}</div>}
                  <p className="text-[13px] text-slate-700 whitespace-pre-wrap line-clamp-4">{m.body}</p>
                  <div className="flex gap-3 mt-2 text-xs">
                    <button className="text-teal-700" onClick={() => { navigator.clipboard?.writeText((m.subject ? `Subject: ${m.subject}\n\n` : '') + m.body); setToast('Copied') }}>Copy</button>
                    {m.channel === 'email' && m.business_email && <a className="text-teal-700" href={`mailto:${m.business_email}?subject=${encodeURIComponent(m.subject || '')}&body=${encodeURIComponent(m.body)}`}>Open in email</a>}
                    {m.status === 'draft' && <button className="text-teal-700 font-medium" onClick={() => markSent(m)}>Mark as sent</button>}
                    <Link className="text-slate-500" href={`/crm/leads/${m.business_id}`}>Edit in lead →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Recent contact events">
          {!data?.events?.length ? <p className="text-sm text-slate-500">No contact recorded yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.events.map((e: any) => (
                <li key={e.id} className="py-2">
                  <Link href={`/crm/leads/${e.business_id}`} className="font-medium text-slate-800 hover:text-teal-700">{e.business_name}</Link>
                  <div className="text-xs text-slate-500 capitalize">{e.event_type.replace('_', ' ')}{e.channel ? ` · ${e.channel.replace('_', ' ')}` : ''}{e.reply_status ? ` · ${e.reply_status}` : ''} · {relative(e.occurred_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}
