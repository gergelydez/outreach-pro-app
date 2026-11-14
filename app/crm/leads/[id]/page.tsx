'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, useApi, ApiError, gbp, dateUk, relative } from '@/lib/crm/client'
import {
  Card, Button, Field, Input, Select, Textarea, Badge, ScoreBadge, WebsiteBadge, WhatsAppBadge, StageBadge, Tabs, ApiErrorNotice, Skeleton, Toast, cx, type Tone,
} from '@/components/crm/ui'
import { STAGES, SUBSCRIBER_TYPES, categoryLabel, stageLabel } from '@/lib/crm/constants'
import type { Finding, ScoreFactor } from '@/lib/crm/audit-types'
import ReplyResult from '@/components/crm/ReplyResult'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = any
type TabKey = 'overview' | 'audit' | 'ai' | 'outreach' | 'activity' | 'notes'

const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {})

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { data, error, loading, reload } = useApi<Detail>(`/api/crm/leads/${params.id}`)
  const [tab, setTab] = useState<TabKey>('overview')
  const [toast, setToast] = useState<{ msg: string; tone?: 'good' | 'bad' } | null>(null)
  const say = (msg: string, tone: 'good' | 'bad' = 'good') => setToast({ msg, tone })

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />
  if (loading || !data) return <Skeleton rows={10} />
  const b = data.business

  async function patch(body: Record<string, unknown>, msg = 'Saved') {
    try { await api(`/api/crm/leads/${b.id}`, { method: 'PATCH', json: body }); say(msg); reload() } catch (e) { say(e instanceof Error ? e.message : 'Failed', 'bad') }
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/leads" className="text-xs text-slate-500 hover:text-teal-700">← All leads</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{b.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
              <span>{categoryLabel(b.category)}</span><span>·</span><span>{b.city}</span>
              <WebsiteBadge status={b.website_status} /><StageBadge stage={b.stage} />
              {data.suppressed && <Badge tone="bad">Suppressed — do not contact</Badge>}
              {data.duplicateOf && <Badge tone="warn">Possible duplicate of <Link className="underline ml-1" href={`/crm/leads/${data.duplicateOf.id}`}>{data.duplicateOf.name}</Link></Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {b.phone && <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="inline-flex items-center h-9 px-3.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">Call</a>}
            <Button onClick={async () => { await api(`/api/crm/leads/${b.id}/audit`, { method: 'POST', json: {} }); say('Audit queued — the worker will pick it up') }}>Re-audit website</Button>
            <Button variant="primary" onClick={() => setTab('ai')}>AI assistant</Button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_330px] gap-4 items-start">
        <div className="min-w-0">
          <Card pad={false}>
            <div className="px-4 pt-2"><Tabs value={tab} onChange={setTab} items={[
              { key: 'overview', label: 'Overview' }, { key: 'audit', label: 'Website audit' }, { key: 'ai', label: 'AI analysis' },
              { key: 'outreach', label: `Outreach${data.messages.length ? ` (${data.messages.length})` : ''}` }, { key: 'activity', label: 'Activity' }, { key: 'notes', label: `Notes${data.notes.length ? ` (${data.notes.length})` : ''}` },
            ]} /></div>
            <div className="p-4">
              {tab === 'overview' && <Overview d={data} />}
              {tab === 'audit' && <AuditTab d={data} />}
              {tab === 'ai' && <AiTab d={data} say={say} reload={reload} onProposal={(id: string) => router.push(`/crm/proposals/${id}`)} />}
              {tab === 'outreach' && <OutreachTab d={data} say={say} reload={reload} />}
              {tab === 'activity' && <ActivityTab d={data} />}
              {tab === 'notes' && <NotesTab d={data} say={say} reload={reload} />}
            </div>
          </Card>
        </div>
        <SideColumn d={data} patch={patch} say={say} reload={reload} onDeleted={() => router.push('/crm/leads')} />
      </div>
      <Toast message={toast?.msg || null} tone={toast?.tone} onClose={() => setToast(null)} />
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 text-sm border-b border-slate-50 last:border-0"><span className="text-slate-500">{label}</span><span className="text-slate-800 min-w-0 break-words">{children}</span></div>
}
const src = (d: Detail, field: string) => {
  const s = d.business.field_sources?.[field]
  return s ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400 whitespace-nowrap" title={s.checked_at ? `Checked ${dateUk(s.checked_at, true)}` : undefined}>{s.source.replace('_places', '').replace('_', ' ')}</span> : null
}

function Overview({ d }: { d: Detail }) {
  const b = d.business
  return (
    <div className="grid md:grid-cols-2 gap-x-8">
      <div>
        <Row label="Address">{b.address || '—'}{src(d, 'address')}</Row>
        <Row label="Phone">{b.phone || '—'}{src(d, 'phone')}</Row>
        <Row label="Email">{b.email || <span className="text-slate-400">Not found</span>}{src(d, 'email')}</Row>
        <Row label="Website">{b.website_url ? <a className="text-teal-700 hover:underline" href={b.website_url} target="_blank" rel="noreferrer">{b.website_url}</a> : '—'}{src(d, 'website_url')}</Row>
        <Row label="Google Maps">{b.google_maps_url ? <a className="text-teal-700 hover:underline" href={b.google_maps_url} target="_blank" rel="noreferrer">Open in Google Maps</a> : '—'}</Row>
      </div>
      <div>
        <Row label="Rating">{b.google_rating ? `${Number(b.google_rating).toFixed(1)} ★` : '—'}{b.google_rating && <span className="ml-1 text-[11px] text-slate-400">(Google, {dateUk(b.google_data_fetched_at)})</span>}</Row>
        <Row label="Reviews">{b.google_review_count ?? '—'}</Row>
        <Row label="WhatsApp"><WhatsAppBadge status={b.whatsapp_status} />{b.whatsapp_url && <a className="ml-2 text-xs text-teal-700" href={b.whatsapp_url} target="_blank" rel="noreferrer">link</a>}{b.whatsapp_checked_at && <span className="ml-1 text-[11px] text-slate-400">checked {dateUk(b.whatsapp_checked_at)}</span>}</Row>
        <Row label="Lead source">{b.lead_source || '—'}</Row>
        <Row label="Discovered">{dateUk(b.created_at, true)}</Row>
      </div>
      {b.whatsapp_status === 'NOT_FOUND' && <p className="md:col-span-2 text-[11px] text-slate-400 mt-3">“No WhatsApp link” means no public WhatsApp link was detected on their website. It does not mean the number is not on WhatsApp — never assume either way.</p>}
    </div>
  )
}

const sevTone: Record<string, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' }

function AuditTab({ d }: { d: Detail }) {
  const a = d.audits[0]
  if (!a) return <p className="text-sm text-slate-500">No audit yet. The Python worker audits new leads automatically; if nothing happens, check that the worker is running (Website Audits page).</p>
  const f = a.facts || {}
  const ps = a.pagespeed
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <WebsiteBadge status={a.website_status} />
        <span className="text-slate-500">Audited {relative(a.created_at)}</span>
        {a.final_url && <a href={a.final_url} target="_blank" rel="noreferrer" className="text-teal-700 text-xs truncate max-w-xs">{a.final_url}</a>}
        {a.error && <Badge tone="bad">{a.error}</Badge>}
      </div>
      {ps?.fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['Performance', ps.performance], ['Accessibility', ps.accessibility], ['SEO', ps.seo], ['Best practices', ps.best_practices]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">{l} <span className="normal-case">(mobile)</span></div>
              <div className={cx('text-xl font-semibold tabular-nums', v == null ? 'text-slate-400' : (v as number) >= 90 ? 'text-emerald-700' : (v as number) >= 50 ? 'text-amber-700' : 'text-rose-700')}>{v ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
      {ps && !ps.fetched && <p className="text-xs text-slate-500">PageSpeed not measured{ps.error ? `: ${ps.error}` : ''}.</p>}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Findings</h3>
        {!a.findings.length ? <p className="text-sm text-slate-500">No significant issues detected.</p> : (
          <div className="space-y-2">
            {a.findings.map((x: Finding, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2 mb-1"><Badge tone={sevTone[x.severity]}>{x.severity}</Badge><span className="text-sm font-medium text-slate-900">{x.what}</span></div>
                <div className="grid sm:grid-cols-3 gap-3 text-[13px] text-slate-600 mt-2">
                  <div><div className="text-[11px] uppercase text-slate-400">Why it matters</div>{x.why}</div>
                  <div><div className="text-[11px] uppercase text-slate-400">Recommendation</div>{x.fix}</div>
                  <div><div className="text-[11px] uppercase text-slate-400">Service to offer</div>{x.service}</div>
                </div>
                {x.evidence && <div className="text-[11px] text-slate-400 mt-2">Evidence: {x.evidence}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {a.reachable && (
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Detected on the page</h3>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge tone={f.https ? 'good' : 'bad'}>{f.https ? 'HTTPS' : 'No HTTPS'}</Badge>
            <Badge tone={f.has_viewport ? 'good' : 'bad'}>{f.has_viewport ? 'Mobile viewport' : 'No mobile viewport'}</Badge>
            <Badge tone={f.contact_form ? 'good' : 'warn'}>{f.contact_form ? 'Contact form' : 'No contact form'}</Badge>
            <Badge tone={f.has_cta ? 'good' : 'warn'}>{f.has_cta ? `CTA: ${(f.cta_texts || []).slice(0, 2).join(', ')}` : 'No clear CTA'}</Badge>
            <Badge tone={f.tel_links ? 'good' : 'warn'}>{f.tel_links ? `${f.tel_links} tap-to-call link(s)` : 'No tap-to-call'}</Badge>
            <Badge>{f.emails?.length ? `Email: ${f.emails[0]}` : 'No email shown'}</Badge>
            {f.local_seo && <Badge tone={f.local_seo.local_business_schema ? 'good' : 'neutral'}>{f.local_seo.local_business_schema ? 'LocalBusiness schema' : 'No LocalBusiness schema'}</Badge>}
            {f.mobile?.tested_with && <Badge tone={f.mobile.horizontal_overflow ? 'bad' : 'good'}>{f.mobile.horizontal_overflow ? 'Sideways scroll on mobile' : 'Fits mobile screen'}</Badge>}
            {f.copyright_year && <Badge>© {f.copyright_year}</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-2">Title: {f.title || '—'} · Meta description: {f.meta_description ? `"${String(f.meta_description).slice(0, 120)}"` : 'missing'}</div>
        </div>
      )}
      {d.audits.length > 1 && <div className="text-xs text-slate-500">Previous audits: {d.audits.slice(1).map((x: any) => `${x.website_status.replace(/_/g, ' ').toLowerCase()} (${dateUk(x.created_at)})`).join(' · ')}</div>}
    </div>
  )
}

function AiTab({ d, say, reload, onProposal }: { d: Detail; say: (m: string, t?: 'good' | 'bad') => void; reload: () => void; onProposal: (id: string) => void }) {
  const b = d.business
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState<ApiError | null>(null)
  const [reply, setReply] = useState('')
  const latest = (kind: string) => d.analyses.find((a: any) => a.kind === kind)
  const [shown, setShown] = useState<Record<string, any>>({})
  const out = (kind: string) => shown[kind] || latest(kind)?.output

  async function run(kind: string, force = false, extra: Record<string, unknown> = {}) {
    setBusy(kind + (force ? '!' : '')); setErr(null)
    try {
      const r = await api('/api/crm/ai', { json: { kind, business_id: b.id, force, ...extra } })
      setShown(s => ({ ...s, [kind]: r.output }))
      say(r.cached ? 'Loaded from cache (no new API cost)' : `Generated with ${r.model}`)
      if (kind === 'outreach' || kind === 'analysis') reload()
      return r
    } catch (e) { setErr(e instanceof ApiError ? e : new ApiError(String(e), 0)) }
    finally { setBusy('') }
  }

  async function saveDrafts() {
    const o = out('outreach'); if (!o) return
    await api(`/api/crm/leads/${b.id}/outreach`, { json: { source: 'ai', messages: [
      { channel: 'email', subject: o.email_subject, body: o.email_body, explanation_ro: o.explanation_ro },
      { channel: 'whatsapp', body: o.whatsapp_message }, { channel: 'contact_form', body: o.contact_form_message },
      { channel: 'linkedin', body: o.linkedin_message },
    ] } })
    say('Saved as drafts in Outreach'); reload()
  }

  async function proposal() {
    const r = await run('proposal')
    if (!r) return
    const o = r.output
    const created = await api('/api/crm/proposals', { json: { business_id: b.id, service_keys: o.recommended_service_keys } })
    await api(`/api/crm/proposals/${created.id}`, { method: 'PATCH', json: { title: o.title, intro: o.intro, scope: o.scope, timeline: o.timeline_note } })
    onProposal(created.id)
  }

  const a = out('analysis'), o = out('outreach'), na = out('next_action'), rp = shown.reply
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === 'analysis'} onClick={() => run('analysis')}>Analyze business</Button>
        <Button loading={busy === 'outreach'} onClick={() => run('outreach')}>Generate email & WhatsApp</Button>
        <Button loading={busy === 'proposal'} onClick={proposal}>Generate proposal</Button>
        <Button loading={busy === 'next_action'} onClick={() => run('next_action')}>Suggest next action</Button>
      </div>
      <p className="text-[11px] text-slate-400">The assistant only receives verified CRM data and audit findings; unknown fields are marked as unknown. Identical requests are served from cache — use Regenerate to force a new answer.</p>
      {err && <ApiErrorNotice error={err} />}

      {na && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-sm">
          <div className="font-medium text-teal-900">Next action: {na.action}</div>
          <div className="text-slate-700 mt-1">{na.reason}</div>
          <div className="text-slate-500 mt-1 italic">🇷🇴 {na.reason_ro}</div>
          <div className="text-xs mt-2 text-slate-500">Suggested stage: {stageLabel(na.suggested_stage)}</div>
        </div>
      )}

      {a && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Business analysis</h3><div className="flex items-center gap-2"><Badge tone={a.confidence === 'high' ? 'good' : a.confidence === 'medium' ? 'warn' : 'neutral'}>{a.confidence} confidence</Badge><Button size="sm" variant="ghost" loading={busy === 'analysis!'} onClick={() => run('analysis', true)}>Regenerate</Button></div></div>
          <p className="text-slate-700">{a.business_summary}</p>
          <p className="text-slate-500 italic">🇷🇴 {a.summary_ro}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {[['Verified problems', a.verified_problems], ['Opportunities', a.business_opportunities], ['Recommended services', a.recommended_services], ['Potential objections', a.potential_objections], ['Evidence', a.evidence], ['Unknown', a.unknowns]].map(([t, list]) => (
              <div key={t as string}><div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{t}</div>
                {(list as string[]).length ? <ul className="list-disc pl-4 space-y-0.5 text-slate-700">{(list as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="text-slate-400">—</span>}</div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Sales angle</div>{a.sales_angle}</div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Recommended offer</div>{a.recommended_offer}</div>
          </div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Recommended next action</div>{a.recommended_next_action}</div>
        </div>
      )}

      {o && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Outreach drafts (British English)</h3>
            <div className="flex gap-2"><Button size="sm" variant="ghost" loading={busy === 'outreach!'} onClick={() => run('outreach', true)}>Regenerate</Button><Button size="sm" variant="primary" onClick={saveDrafts}>Save as drafts</Button></div></div>
          {[['Email', `Subject: ${o.email_subject}\n\n${o.email_body}`], ['WhatsApp', o.whatsapp_message], ['Contact form', o.contact_form_message], ['Follow-up', o.follow_up_message], ['LinkedIn', o.linkedin_message]].map(([t, text]) => (
            <div key={t as string}>
              <div className="flex items-center justify-between mb-1"><span className="text-[11px] uppercase tracking-wide text-slate-400">{t}</span><button className="text-xs text-teal-700" onClick={() => { copy(text as string); say('Copied') }}>Copy</button></div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] text-slate-800 bg-slate-50 rounded-md p-3">{text as string}</pre>
            </div>
          ))}
          <div className="text-xs text-slate-500">Finding used: {o.finding_used}</div>
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-900"><b>🇷🇴 Explicație:</b> {o.explanation_ro}</div>
          {d.compliance.email.level !== 'ok' && <div className="text-xs text-amber-800">Before emailing: {d.compliance.email.messages.join(' ')}</div>}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
        <h3 className="font-semibold text-slate-900">Explain a customer reply (Romanian)</h3>
        <Textarea rows={4} placeholder="Paste the English reply from this business…" value={reply} onChange={e => setReply(e.target.value)} />
        <Button loading={busy === 'reply'} disabled={!reply.trim()} onClick={() => run('reply', false, { reply_text: reply })}>Explain & suggest a reply</Button>
        {rp && <ReplyResult r={rp} say={say} />}
      </div>
    </div>
  )
}

function OutreachTab({ d, say, reload }: { d: Detail; say: (m: string, t?: 'good' | 'bad') => void; reload: () => void }) {
  const b = d.business
  const [ev, setEv] = useState({ event_type: 'contacted', channel: 'email', reply_status: 'neutral', notes: '', schedule_follow_ups: true })
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [manual, setManual] = useState({ channel: 'email', subject: '', body: '' })

  async function record() {
    if (ev.event_type === 'opt_out' && !confirm('Record an opt-out? The business will be added to the suppression list and follow-ups cancelled.')) return
    try { await api(`/api/crm/leads/${b.id}/events`, { json: ev }); say('Recorded'); setEv({ ...ev, notes: '' }); reload() } catch (e) { say(e instanceof Error ? e.message : 'Failed', 'bad') }
  }
  async function msg(id: string, body: Record<string, unknown>, text = 'Saved') {
    try { await api(`/api/crm/leads/${b.id}/outreach`, { method: 'PATCH', json: { message_id: id, ...body } }); say(text); reload() } catch (e) { say(e instanceof Error ? e.message : 'Failed', 'bad') }
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-2">
        {(['email', 'whatsapp', 'contact_form', 'phone'] as const).map(ch => {
          const c = d.compliance[ch]
          return (
            <div key={ch} className={cx('rounded-lg border p-3 text-xs', c.level === 'blocked' ? 'border-rose-200 bg-rose-50 text-rose-800' : c.level === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
              <div className="font-semibold capitalize mb-1">{ch.replace('_', ' ')} · {c.level}</div>
              {c.messages.map((m: string, i: number) => <p key={i}>{m}</p>)}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-500">Nothing is sent automatically. Copy a draft, send it yourself, then mark it as sent. You are responsible for checking that each contact method is lawful (UK GDPR / PECR).</p>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Drafts & sent messages</h3>
        {!d.messages.length && <p className="text-sm text-slate-500">No messages yet — generate them in the AI tab or write one below.</p>}
        <div className="space-y-2">
          {d.messages.map((m: any) => (
            <div key={m.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                <Badge tone="info">{m.channel.replace('_', ' ')}</Badge>
                <Badge tone={m.status === 'sent' ? 'good' : m.status === 'archived' ? 'neutral' : 'warn'}>{m.status}{m.sent_at ? ` ${dateUk(m.sent_at)}` : ''}</Badge>
                {m.source === 'ai' && <Badge>AI draft</Badge>}
                <span className="flex-1" />
                <button className="text-teal-700" onClick={() => { copy((m.subject ? `Subject: ${m.subject}\n\n` : '') + (editing[m.id] ?? m.body)); say('Copied') }}>Copy</button>
                {m.channel === 'email' && b.email && <a className="text-teal-700" href={`mailto:${b.email}?subject=${encodeURIComponent(m.subject || '')}&body=${encodeURIComponent(editing[m.id] ?? m.body)}`}>Open in email</a>}
                {m.status === 'draft' && <button className="text-teal-700 font-medium" disabled={d.suppressed} onClick={() => msg(m.id, { status: 'sent', body: editing[m.id] }, 'Marked as sent')}>Mark as sent</button>}
                {m.status === 'draft' && <button className="text-slate-500" onClick={() => msg(m.id, { status: 'archived' }, 'Archived')}>Archive</button>}
              </div>
              {m.subject && <div className="text-xs text-slate-500 mb-1">Subject: {m.subject}</div>}
              {m.status === 'draft' ? (
                <>
                  <Textarea rows={Math.min(10, Math.max(3, (editing[m.id] ?? m.body).split('\n').length + 1))} value={editing[m.id] ?? m.body} onChange={e => setEditing(s => ({ ...s, [m.id]: e.target.value }))} />
                  {editing[m.id] !== undefined && editing[m.id] !== m.body && <Button size="sm" className="mt-2" onClick={() => msg(m.id, { body: editing[m.id] })}>Save edits</Button>}
                </>
              ) : <pre className="whitespace-pre-wrap font-sans text-[13px] text-slate-700">{m.body}</pre>}
              {m.explanation_ro && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer text-amber-800">🇷🇴 Explicație</summary><p className="mt-1">{m.explanation_ro}</p></details>}
            </div>
          ))}
        </div>
        <details className="mt-3">
          <summary className="text-sm text-teal-700 cursor-pointer">Write a message manually</summary>
          <div className="grid gap-2 mt-2">
            <Select value={manual.channel} onChange={e => setManual({ ...manual, channel: e.target.value })}>{['email', 'whatsapp', 'contact_form', 'linkedin'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</Select>
            {manual.channel === 'email' && <Input placeholder="Subject" value={manual.subject} onChange={e => setManual({ ...manual, subject: e.target.value })} />}
            <Textarea rows={5} value={manual.body} onChange={e => setManual({ ...manual, body: e.target.value })} />
            <Button size="sm" disabled={!manual.body.trim()} onClick={async () => { await api(`/api/crm/leads/${b.id}/outreach`, { json: { messages: [manual] } }); setManual({ channel: 'email', subject: '', body: '' }); say('Draft saved'); reload() }}>Save draft</Button>
          </div>
        </details>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Record contact or reply</h3>
        <div className="grid sm:grid-cols-4 gap-2">
          <Select value={ev.event_type} onChange={e => setEv({ ...ev, event_type: e.target.value })}>
            <option value="contacted">I contacted them</option><option value="reply">They replied</option><option value="call">Had a call</option><option value="meeting">Had a meeting</option><option value="opt_out">They opted out</option><option value="bounced">Message bounced</option>
          </Select>
          <Select value={ev.channel} onChange={e => setEv({ ...ev, channel: e.target.value })}>{['email', 'whatsapp', 'contact_form', 'phone', 'linkedin', 'in_person'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</Select>
          {ev.event_type === 'reply' ? (
            <Select value={ev.reply_status} onChange={e => setEv({ ...ev, reply_status: e.target.value })}><option value="positive">Positive</option><option value="neutral">Neutral / question</option><option value="negative">Negative</option></Select>
          ) : ev.event_type === 'contacted' ? (
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={ev.schedule_follow_ups} onChange={e => setEv({ ...ev, schedule_follow_ups: e.target.checked })} /> Create follow-up reminders</label>
          ) : <span />}
          <Button variant="primary" onClick={record} disabled={d.suppressed && ev.event_type === 'contacted'}>Record</Button>
        </div>
        <Input className="mt-2" placeholder="Notes (optional)" value={ev.notes} onChange={e => setEv({ ...ev, notes: e.target.value })} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Contact history</h3>
        {!d.events.length ? <p className="text-sm text-slate-500">No contact recorded yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.events.map((e: any) => <li key={e.id} className="py-2 flex justify-between gap-3"><span><b className="capitalize">{e.event_type.replace('_', ' ')}</b>{e.channel ? ` via ${e.channel.replace('_', ' ')}` : ''}{e.reply_status ? ` · ${e.reply_status}` : ''}{e.notes ? ` — ${e.notes}` : ''}</span><span className="text-xs text-slate-400 whitespace-nowrap">{dateUk(e.occurred_at, true)}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

function ActivityTab({ d }: { d: Detail }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Activity</h3>
        <ul className="space-y-2">{d.activity.map((a: any) => <li key={a.id} className="text-sm"><div className="text-slate-700">{a.summary}</div><div className="text-xs text-slate-400">{dateUk(a.created_at, true)}</div></li>)}</ul>
        {!d.activity.length && <p className="text-sm text-slate-500">No activity yet.</p>}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Stage history</h3>
        <ul className="space-y-2">{d.stages.map((s: any) => <li key={s.id} className="text-sm"><span className="text-slate-700">{s.from_stage ? `${stageLabel(s.from_stage)} → ` : ''}<b>{stageLabel(s.to_stage)}</b></span><div className="text-xs text-slate-400">{dateUk(s.created_at, true)} · by {s.changed_by}</div></li>)}</ul>
      </div>
    </div>
  )
}

function NotesTab({ d, say, reload }: { d: Detail; say: (m: string) => void; reload: () => void }) {
  const [text, setText] = useState('')
  return (
    <div className="space-y-3">
      <Textarea rows={3} placeholder="Add a note…" value={text} onChange={e => setText(e.target.value)} />
      <Button size="sm" variant="primary" disabled={!text.trim()} onClick={async () => { await api(`/api/crm/leads/${d.business.id}/notes`, { json: { body: text } }); setText(''); say('Note added'); reload() }}>Add note</Button>
      <ul className="divide-y divide-slate-100">{d.notes.map((n: any) => <li key={n.id} className="py-2.5"><p className="text-sm text-slate-800 whitespace-pre-wrap">{n.body}</p><div className="text-xs text-slate-400 mt-0.5">{dateUk(n.created_at, true)}</div></li>)}</ul>
    </div>
  )
}

function SideColumn({ d, patch, say, reload, onDeleted }: { d: Detail; patch: (b: Record<string, unknown>, m?: string) => void; say: (m: string, t?: 'good' | 'bad') => void; reload: () => void; onDeleted: () => void }) {
  const b = d.business
  const [contact, setContact] = useState({ email: b.email || '', phone: b.phone || '', deal_value: b.deal_value ?? '', lawful_basis: b.lawful_basis || '' })
  const [fu, setFu] = useState({ title: `Follow up with ${b.name}`, due_at: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) })
  const score = d.score

  async function del() {
    const suppress = confirm('Also add this business to the suppression list so it is never imported or contacted again?\n\nOK = delete + suppress, Cancel = choose again')
    if (!suppress && !confirm('Delete permanently WITHOUT suppressing?')) return
    await api(`/api/crm/leads/${b.id}?suppress=${suppress ? 1 : 0}`, { method: 'DELETE' })
    onDeleted()
  }

  return (
    <div className="space-y-4">
      <Card title="Opportunity score">
        <div className="flex items-center gap-3"><ScoreBadge score={b.opportunity_score} showLabel /></div>
        {score ? (
          <ul className="mt-3 space-y-1.5">
            {(score.factors as ScoreFactor[]).map(f => (
              <li key={f.key} className="flex items-start justify-between gap-2 text-[13px]">
                <span className={cx(f.points > 0 ? 'text-slate-800' : 'text-slate-400')} title={f.evidence}>{f.label}{!f.verified && <span className="text-[11px]"> (unverified)</span>}<div className="text-[11px] text-slate-400">{f.evidence}</div></span>
                <span className={cx('tabular-nums text-xs whitespace-nowrap', f.points > 0 ? 'text-teal-700 font-semibold' : 'text-slate-400')}>{f.points}/{f.max}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-slate-500 mt-2">Not scored yet — waiting for the website audit.</p>}
      </Card>

      <Card title="Sales">
        <div className="space-y-3">
          <Field label="Stage"><Select value={b.stage} onChange={e => patch({ stage: e.target.value }, 'Stage updated')}>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
          <Field label="Expected deal value (£)"><Input type="number" min={0} value={contact.deal_value} onChange={e => setContact({ ...contact, deal_value: e.target.value })} onBlur={() => String(contact.deal_value) !== String(b.deal_value ?? '') && patch({ deal_value: contact.deal_value })} /></Field>
          <div className="text-xs text-slate-500">Next follow-up: <b className={b.next_follow_up_at && new Date(b.next_follow_up_at) < new Date() ? 'text-rose-700' : 'text-slate-800'}>{b.next_follow_up_at ? dateUk(b.next_follow_up_at) : 'none'}</b> · Last contact: {relative(b.last_contacted_at)}</div>
          {d.proposals.length > 0 && <div className="text-xs">Proposals: {d.proposals.map((p: any) => <Link key={p.id} href={`/crm/proposals/${p.id}`} className="text-teal-700 mr-2">{gbp(p.total)} ({p.status})</Link>)}</div>}
          <Button size="sm" className="w-full" onClick={async () => { const r = await api('/api/crm/proposals', { json: { business_id: b.id } }); window.location.href = `/crm/proposals/${r.id}` }}>New proposal</Button>
        </div>
      </Card>

      <Card title="Schedule follow-up">
        <div className="space-y-2">
          <Input value={fu.title} onChange={e => setFu({ ...fu, title: e.target.value })} />
          <div className="flex gap-2"><Input type="date" value={fu.due_at} onChange={e => setFu({ ...fu, due_at: e.target.value })} />
            <Button size="sm" onClick={async () => { await api('/api/crm/followups', { json: { business_id: b.id, title: fu.title, due_at: `${fu.due_at}T09:00:00` } }); say('Follow-up scheduled'); reload() }}>Add</Button></div>
          {d.tasks.filter((t: any) => t.status === 'open').map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-xs"><span className={new Date(t.due_at) < new Date() ? 'text-rose-700' : 'text-slate-600'}>{dateUk(t.due_at)} · {t.title}</span>
              <button className="text-teal-700" onClick={async () => { await api(`/api/crm/followups/${t.id}`, { method: 'PATCH', json: { status: 'done' } }); reload() }}>Done</button></div>
          ))}
        </div>
      </Card>

      <Card title="Contact & compliance">
        <div className="space-y-3">
          <Field label="Email"><Input value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} onBlur={() => contact.email !== (b.email || '') && patch({ email: contact.email })} /></Field>
          <Field label="Phone"><Input value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} onBlur={() => contact.phone !== (b.phone || '') && patch({ phone: contact.phone })} /></Field>
          <Field label="Subscriber type (PECR)" hint="Check Companies House: Ltd/LLP = corporate"><Select value={b.subscriber_type} onChange={e => patch({ subscriber_type: e.target.value })}>{SUBSCRIBER_TYPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
          <Field label="Lawful basis / consent notes"><Input placeholder="e.g. Legitimate interests — LIA 14/11" value={contact.lawful_basis} onChange={e => setContact({ ...contact, lawful_basis: e.target.value })} onBlur={() => contact.lawful_basis !== (b.lawful_basis || '') && patch({ lawful_basis: contact.lawful_basis })} /></Field>
          {b.possible_duplicate_of && <Button size="sm" onClick={() => patch({ possible_duplicate_of: null }, 'Marked as not a duplicate')}>Not a duplicate</Button>}
          <Button size="sm" variant="danger" className="w-full" onClick={del}>Delete lead (GDPR)</Button>
        </div>
      </Card>
    </div>
  )
}
