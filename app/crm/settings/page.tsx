'use client'

import { useEffect, useState } from 'react'
import { api, useApi, ApiError, relative, dateUk } from '@/lib/crm/client'
import { PageHeader, Card, Button, Field, Input, Select, Badge, ApiErrorNotice, Toast, cx } from '@/components/crm/ui'
import { UK_CATEGORIES, UK_REGIONS } from '@/lib/crm/constants'
import type { CrmSettings } from '@/lib/crm/settings'

/* eslint-disable @typescript-eslint/no-explicit-any */
const WEIGHT_LABELS: Record<string, string> = {
  no_website: 'No verified website', social_only: 'Social media only', directory_or_free: 'Directory listing / free subdomain', broken_website: 'Broken website (confirmed)',
  outdated_website: 'Clearly outdated website', needs_redesign: 'Needs redesign', poor_mobile: 'Poor mobile experience', poor_pagespeed: 'Poor PageSpeed (mobile < 50)',
  missing_contact_form: 'Missing contact form', missing_cta: 'Missing clear CTA', no_whatsapp_link: 'No WhatsApp link detected', established_reviews: 'Established reviews (20+)', strong_reputation: 'Strong reputation (4.5★, 10+ reviews)',
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className={cx('mt-1 w-2 h-2 rounded-full shrink-0', ok ? 'bg-emerald-500' : 'bg-amber-500')} />
      <div><span className="text-slate-800">{label}</span>{detail && <div className="text-xs text-slate-500">{detail}</div>}</div>
    </div>
  )
}

export default function SettingsPage() {
  const setup = useApi<any>('/api/crm/setup')
  const data = useApi<{ settings: CrmSettings; defaults: CrmSettings }>(setup.data?.database?.connected && !setup.data.database.pending.length ? '/api/crm/settings' : null)
  const supp = useApi<any>(setup.data?.database?.connected && !setup.data.database.pending.length ? '/api/crm/suppression' : null)
  const [s, setS] = useState<CrmSettings | null>(null)
  const [toast, setToast] = useState<{ m: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [supForm, setSupForm] = useState({ kind: 'email', value: '', reason: '' })
  useEffect(() => { if (data.data) setS(data.data.settings) }, [data.data])

  async function migrate() {
    setBusy('migrate')
    try { const r = await api('/api/crm/setup', { json: {} }); setToast({ m: r.applied.length ? `Database ready (${r.applied.join(', ')})` : 'Database already up to date' }); setup.reload() }
    catch (e) { setToast({ m: e instanceof ApiError ? e.message : 'Failed', bad: true }) }
    setBusy('')
  }
  async function save<K extends keyof CrmSettings>(key: K) {
    if (!s) return
    setBusy(key)
    try { const r = await api('/api/crm/settings', { method: 'PUT', json: { key, value: s[key] } }); setToast({ m: key === 'scoring' ? `Saved — ${r.rescored} lead scores recalculated` : 'Saved' }); data.reload() }
    catch (e) { setToast({ m: e instanceof ApiError ? e.message : 'Failed', bad: true }) }
    setBusy('')
  }
  const set = <K extends keyof CrmSettings>(key: K, patch: Partial<CrmSettings[K]>) => setS(prev => prev && ({ ...prev, [key]: { ...(prev[key] as object), ...patch } }))

  const env = setup.data?.env || {}
  const db = setup.data?.database

  return (
    <>
      <PageHeader title="Settings & API" subtitle="Secrets live only in your server environment variables — this page shows whether they are set, never their values." />
      {setup.error && <div className="mb-4"><ApiErrorNotice error={setup.error} onRetry={setup.reload} /></div>}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card title="Setup status" action={<Button size="sm" variant="ghost" onClick={setup.reload}>Refresh</Button>}>
          {setup.data && <>
            <Status ok={env.STORAGE !== 'none' && db?.connected} label={env.STORAGE === 'postgres' ? 'Database (PostgreSQL)' : 'Database (Vercel Blob)'}
              detail={env.STORAGE === 'none' ? 'Connect the Vercel Blob store to this project (Vercel → Storage → Blob → Connect), then redeploy.' : db?.error || (env.STORAGE === 'vercel_blob' ? 'Stored encrypted in your existing Blob store — tables are created automatically.' : 'Connected')} />
            {db?.connected && db.pending.length > 0 && <Button variant="primary" size="sm" className="ml-4 mb-2" loading={busy === 'migrate'} onClick={migrate}>Initialise / update database</Button>}
            <Status ok={env.ANTHROPIC_API_KEY} label="Claude API" detail={env.ANTHROPIC_API_KEY ? `ANTHROPIC_API_KEY set · model ${env.CLAUDE_MODEL}` : 'Set ANTHROPIC_API_KEY (same key as the Romanian tools) and redeploy.'} />
            <Status ok={env.GOOGLE_PLACES_API_KEY} label="Google Places API (New)" detail="GOOGLE_PLACES_API_KEY — needed for Business Hunter. Enable “Places API (New)” in Google Cloud." />
            <Status ok={!!setup.data.worker?.last_seen} label="Audit worker (optional)" detail={setup.data.worker?.last_seen ? `Last seen ${relative(setup.data.worker.last_seen)}` : env.CRM_WORKER_TOKEN ? 'Token set. Start the worker (worker/README.md) to audit websites.' : 'To audit websites, set CRM_WORKER_TOKEN and start the Python worker (worker/README.md).'} />
            <Status ok={true} label="Access" detail={env.CRM_PASSWORD ? 'Protected with CRM_PASSWORD.' : 'Open, like the rest of the app. Optional: set CRM_PASSWORD to require a login.'} />
          </>}
        </Card>

        {s && <>
          <Card title="Business profile" action={<Button size="sm" variant="primary" loading={busy === 'business_profile'} onClick={() => save('business_profile')}>Save</Button>}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Company name"><Input value={s.business_profile.company_name} onChange={e => set('business_profile', { company_name: e.target.value })} /></Field>
              <Field label="Your name (signature)"><Input value={s.business_profile.sender_name} onChange={e => set('business_profile', { sender_name: e.target.value })} /></Field>
              <Field label="Business email"><Input value={s.business_profile.business_email} onChange={e => set('business_profile', { business_email: e.target.value })} /></Field>
              <Field label="Website / portfolio"><Input value={s.business_profile.website} onChange={e => set('business_profile', { website: e.target.value })} /></Field>
              <Field label="Currency"><Select value={s.business_profile.currency} onChange={e => set('business_profile', { currency: e.target.value })}><option>GBP</option><option>EUR</option></Select></Field>
              <Field label="Default offer"><Input value={s.business_profile.default_offer} onChange={e => set('business_profile', { default_offer: e.target.value })} /></Field>
            </div>
          </Card>
        </>}
      </div>

      {s && (
        <div className="grid lg:grid-cols-2 gap-4 items-start mt-4">
          <Card title="Target market & limits" action={<div className="flex gap-2"><Button size="sm" variant="primary" loading={busy === 'target_market'} onClick={async () => { await save('target_market'); await save('limits') }}>Save</Button></div>}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Default region"><Select value={s.target_market.region} onChange={e => set('target_market', { region: e.target.value })}>{Object.keys(UK_REGIONS).map(r => <option key={r}>{r}</option>)}</Select></Field>
              <Field label="Daily discovery target"><Input type="number" min={1} value={s.target_market.daily_target} onChange={e => set('target_market', { daily_target: Number(e.target.value) })} /></Field>
              <Field label="Default cities" hint="Comma separated"><Input value={s.target_market.cities.join(', ')} onChange={e => set('target_market', { cities: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></Field>
              <Field label="Default categories">
                <div className="flex flex-wrap gap-1.5">{UK_CATEGORIES.map(c => {
                  const on = s.target_market.categories.includes(c.key)
                  return <button key={c.key} type="button" onClick={() => set('target_market', { categories: on ? s.target_market.categories.filter(x => x !== c.key) : [...s.target_market.categories, c.key] })} className={cx('text-xs px-2 py-1 rounded-md border', on ? 'bg-teal-700 text-white border-teal-700' : 'border-slate-300 text-slate-600')}>{c.label}</button>
                })}</div>
              </Field>
              <Field label="Max new leads per day (hard limit)" hint="Protects your Google API budget"><Input type="number" min={1} value={s.limits.daily_discovery_max} onChange={e => set('limits', { daily_discovery_max: Number(e.target.value) })} /></Field>
              <Field label="Max new leads per search run"><Input type="number" min={1} max={60} value={s.limits.max_per_run} onChange={e => set('limits', { max_per_run: Number(e.target.value) })} /></Field>
              <Field label="AI requests per hour (limit)"><Input type="number" min={1} value={s.limits.ai_requests_per_hour} onChange={e => set('limits', { ai_requests_per_hour: Number(e.target.value) })} /></Field>
            </div>
          </Card>

          <Card title="Opportunity scoring weights" action={<div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => data.data && setS({ ...s, scoring: data.data.defaults.scoring })}>Defaults</Button><Button size="sm" variant="primary" loading={busy === 'scoring'} onClick={() => save('scoring')}>Save & recalculate</Button></div>}>
            <p className="text-xs text-slate-500 mb-3">Only one website-presence signal counts (the strongest). Mobile + PageSpeed are capped together. The score is points earned ÷ points applicable to that lead, so businesses without a website are not penalised for “missing” website signals. Unverified data earns nothing.</p>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(s.scoring).map(([k, v]) => (
                <label key={k} className="flex items-center justify-between gap-2 text-[13px]"><span className="text-slate-600">{WEIGHT_LABELS[k] || k}</span>
                  <input type="number" min={0} max={50} value={v} onChange={e => setS({ ...s, scoring: { ...s.scoring, [k]: Number(e.target.value) } })} className="w-16 h-8 px-2 rounded-md border border-slate-300 text-right tabular-nums" /></label>
              ))}
            </div>
          </Card>

          <Card title="Services & pricing" action={<Button size="sm" variant="primary" loading={busy === 'services'} onClick={() => save('services')}>Save</Button>}>
            <p className="text-xs text-slate-500 mb-2">Default prices used in proposals. They are starting points you can change per proposal, not promises.</p>
            <div className="space-y-2">
              {s.services.map((sv, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_130px_auto] gap-2 items-center">
                  <Input value={sv.label} onChange={e => setS({ ...s, services: s.services.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                  <Input type="number" min={0} value={sv.price} onChange={e => setS({ ...s, services: s.services.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x) })} />
                  <Select value={sv.recurring || ''} onChange={e => setS({ ...s, services: s.services.map((x, j) => j === i ? { ...x, recurring: e.target.value === 'monthly' ? 'monthly' : null } : x) })}><option value="">One-off</option><option value="monthly">Monthly</option></Select>
                  <Button size="sm" variant="ghost" onClick={() => setS({ ...s, services: s.services.filter((_, j) => j !== i) })}>✕</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => setS({ ...s, services: [...s.services, { key: `custom_${Date.now()}`, label: 'New service', price: 0, recurring: null }] })}>+ Add service</Button>
            </div>
          </Card>

          <Card title="Outreach" action={<Button size="sm" variant="primary" loading={busy === 'outreach'} onClick={() => save('outreach')}>Save</Button>}>
            <div className="grid gap-3">
              <Field label="Tone for AI-written messages"><Input value={s.outreach.tone} onChange={e => set('outreach', { tone: e.target.value })} /></Field>
              <Field label="Follow-up reminders (days after first contact)" hint="Reminders only — nothing is sent automatically"><Input value={s.outreach.follow_up_days.join(', ')} onChange={e => set('outreach', { follow_up_days: e.target.value.split(',').map(x => Number(x.trim())).filter(n => n > 0) })} /></Field>
              <Field label="Email signature"><Input value={s.outreach.signature} onChange={e => set('outreach', { signature: e.target.value })} /></Field>
            </div>
          </Card>

          <Card title="Suppression list (opt-outs)" className="lg:col-span-2">
            <p className="text-xs text-slate-500 mb-2">Contacts here are never imported again and the CRM blocks marking them as contacted. Opt-outs recorded on a lead are added automatically.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <Select className="w-32" value={supForm.kind} onChange={e => setSupForm({ ...supForm, kind: e.target.value })}><option value="email">Email</option><option value="phone">Phone</option><option value="domain">Domain</option></Select>
              <Input className="w-64" placeholder="value" value={supForm.value} onChange={e => setSupForm({ ...supForm, value: e.target.value })} />
              <Input className="w-64" placeholder="reason (optional)" value={supForm.reason} onChange={e => setSupForm({ ...supForm, reason: e.target.value })} />
              <Button onClick={async () => { try { await api('/api/crm/suppression', { json: supForm }); setSupForm({ ...supForm, value: '', reason: '' }); supp.reload() } catch (e) { setToast({ m: e instanceof Error ? e.message : 'Failed', bad: true }) } }}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(supp.data?.items || []).map((it: any) => (
                <span key={it.id} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs"><Badge>{it.kind}</Badge>{it.value}<span className="text-slate-400">{dateUk(it.created_at)}</span>
                  <button className="text-slate-400 hover:text-rose-600" onClick={async () => { await api(`/api/crm/suppression?id=${it.id}`, { method: 'DELETE' }); supp.reload() }}>✕</button></span>
              ))}
              {!supp.data?.items?.length && <span className="text-sm text-slate-400">Empty.</span>}
            </div>
          </Card>
        </div>
      )}
      <Toast message={toast?.m || null} tone={toast?.bad ? 'bad' : 'good'} onClose={() => setToast(null)} />
    </>
  )
}
