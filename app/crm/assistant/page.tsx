'use client'

import { useState } from 'react'
import { api, useApi, ApiError, relative } from '@/lib/crm/client'
import { PageHeader, Card, Button, Textarea, Input, Kpi, ApiErrorNotice, Badge, Toast, Field, Select } from '@/components/crm/ui'
import ReplyResult from '@/components/crm/ReplyResult'

/* eslint-disable @typescript-eslint/no-explicit-any */
const OBJECTIONS = [
  ['too_expensive', 'Too expensive'], ['already_have_website', 'We already have a website'], ['not_interested', 'We are not interested'],
  ['already_have_someone', 'We already have someone'], ['contact_later', 'Contact us later'], ['send_more_info', 'Send me more information'],
]

export default function AssistantPage() {
  const usage = useApi<any>('/api/crm/ai/usage')
  const [reply, setReply] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const leads = useApi<any>(leadSearch.trim().length >= 2 ? `/api/crm/leads?q=${encodeURIComponent(leadSearch)}&page_size=5` : null)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [objection, setObjection] = useState('too_expensive')
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function explain(text: string) {
    setBusy(true); setErr(null); setResult(null)
    try { const r = await api('/api/crm/ai', { json: { kind: 'reply', reply_text: text, business_id: leadId || undefined } }); setResult(r.output); usage.reload() }
    catch (e) { setErr(e instanceof ApiError ? e : new ApiError(String(e), 0)) }
    setBusy(false)
  }

  const openai = usage.data?.byProvider?.find((p: any) => p.provider === 'openai')
  return (
    <>
      <PageHeader title="AI Sales Assistant" subtitle={<>Understand English replies in Romanian, handle objections and keep an eye on API costs. Model: <b>{usage.data?.model || 'not configured'}</b></>} />
      {usage.data && !usage.data.model && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>OpenAI is not configured.</b> Set <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> in the server environment. A ChatGPT subscription does not include API usage — the API is billed separately at platform.openai.com.</div>}

      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          <Card title="Explain a customer reply">
            <div className="space-y-3">
              <Field label="Link to a lead (optional — gives the assistant context)">
                <Input placeholder="Type a business name…" value={leadSearch} onChange={e => { setLeadSearch(e.target.value); setLeadId(null) }} />
              </Field>
              {leads.data?.rows?.length > 0 && !leadId && (
                <div className="flex flex-wrap gap-1.5">{leads.data.rows.map((l: any) => <button key={l.id} className="text-xs rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50" onClick={() => { setLeadId(l.id); setLeadSearch(l.name) }}>{l.name} · {l.city}</button>)}</div>
              )}
              {leadId && <Badge tone="accent">Linked to {leadSearch}</Badge>}
              <Textarea rows={6} placeholder="Paste the reply you received (English)…" value={reply} onChange={e => setReply(e.target.value)} />
              <Button variant="primary" loading={busy} disabled={!reply.trim()} onClick={() => explain(reply)}>Translate, explain & suggest a reply</Button>
              {err && <ApiErrorNotice error={err} />}
              {result && <ReplyResult r={result} say={setToast} />}
            </div>
          </Card>

          <Card title="Objection handler">
            <div className="flex flex-wrap gap-2 items-end">
              <Field label="The prospect said…"><Select value={objection} onChange={e => setObjection(e.target.value)} className="w-72">{OBJECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Button loading={busy} onClick={() => explain(`"${OBJECTIONS.find(o => o[0] === objection)![1]}." (Typical objection from a UK tradesperson after receiving my first message about their website.)`)}>Suggest a response</Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Responses are honest and low-pressure: no fake discounts, no promises of rankings or leads.</p>
          </Card>
        </div>

        <Card title="AI & API usage (30 days)">
          {usage.error ? <ApiErrorNotice error={usage.error} /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Kpi label="OpenAI requests" value={openai?.requests || 0} />
                <Kpi label="Est. OpenAI cost" value={usage.data?.costsConfigured ? `$${(openai?.cost || 0).toFixed(2)}` : 'n/a'} hint={usage.data?.costsConfigured ? undefined : 'set OPENAI_*_COST_PER_1M'} />
                <Kpi label="Tokens in / out" value={<span className="text-base">{(openai?.input_tokens || 0).toLocaleString('en-GB')} / {(openai?.output_tokens || 0).toLocaleString('en-GB')}</span>} />
                <Kpi label="Errors" value={openai?.errors || 0} />
              </div>
              {(usage.data?.byProvider || []).filter((p: any) => p.provider !== 'openai').map((p: any) => (
                <div key={p.provider} className="flex justify-between text-sm"><span className="text-slate-600">{p.provider.replace('_', ' ')}</span><span className="tabular-nums">{p.requests} req · est. ${p.cost.toFixed(2)}</span></div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] uppercase text-slate-400 mb-1">Recent requests</div>
                <ul className="space-y-1 text-xs max-h-64 overflow-y-auto">
                  {(usage.data?.recent || []).map((r: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2"><span className={r.ok ? 'text-slate-600' : 'text-rose-700'}>{r.provider} · {r.operation}{r.ok ? '' : ' (error)'}</span><span className="text-slate-400 whitespace-nowrap">{relative(r.created_at)}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  )
}
