'use client'

// Pagina simplă, în română: alegi orașul și meseria → aplicația caută firmele pe Google,
// le verifică site-ul și îți arată, pentru fiecare, problemele și butoanele de contact.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/crm/client'
import { Button, Select, Badge, cx } from '@/components/crm/ui'
import { UK_CATEGORIES, UK_REGIONS } from '@/lib/crm/constants'
import { STATUS_RO, findingRo, waNumber, CATEGORY_RO } from '@/lib/crm/ro'
import { getSettings as getAppSettings } from '@/lib/storage'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Msg { whatsapp_en: string; whatsapp_ro: string; email_subject_en: string; email_en: string; email_ro: string; finding_used_ro: string }
interface Lead {
  id: string; name: string; category: string; city: string; phone: string | null; phone_e164: string | null; email: string | null
  website_url: string | null; website_status: string; whatsapp_status: string; whatsapp_source: string | null
  google_rating: number | null; google_review_count: number | null; google_maps_url: string | null
  opportunity_score: number | null; stage: string; findings: { code: string; what: string }[] | null; audited_at: string | null; message: Msg | null
}

const ALL_CITIES = Object.values(UK_REGIONS).flat()
const regionOf = (city: string) => Object.entries(UK_REGIONS).find(([, cs]) => cs.includes(city))?.[0] || null

export default function Gaseste() {
  const [city, setCity] = useState('Birmingham')
  const [category, setCategory] = useState('plumber')
  const [show, setShow] = useState<'todo' | 'all'>('todo')
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [keys, setKeys] = useState({ google: '', sender: '' })

  useEffect(() => {
    const s = getAppSettings()
    setKeys({ google: s.googlePlacesApiKey || '', sender: [s.senderName, s.yourWebsite].filter(Boolean).join(', ') })
  }, [])

  const load = useCallback(async () => {
    try {
      const d = await api<{ rows: Lead[]; pendingAudits: number }>(`/api/crm/simple?city=${encodeURIComponent(city)}&category=${category}&show=${show}`)
      setRows(d.rows); setPending(d.pendingAudits)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [city, category, show])
  useEffect(() => { load() }, [load])

  async function auditAll() {
    setBusy('audit')
    let done = 0
    try {
      for (let i = 0; i < 25; i++) {
        const r = await api<{ processed: unknown[]; remaining: number }>('/api/crm/audit/run', { json: { limit: 4 } })
        done += r.processed.length
        setInfo(`Verific site-urile… ${done} gata${r.remaining ? `, mai sunt ${r.remaining}` : ''}`)
        await load()
        if (!r.remaining || !r.processed.length) break
      }
      setInfo(done ? `Gata: am verificat ${done} site-uri.` : 'Nu era nimic de verificat.')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  async function search() {
    setBusy('search'); setErr(''); setInfo('Caut firme pe Google…')
    try {
      const r = await api<{ found: number; newCount: number; duplicates: number }>('/api/crm/discovery', {
        json: { city, region: regionOf(city), category, limit: 20, min_reviews: 3, google_api_key: keys.google || undefined },
      })
      setInfo(`Google a dat ${r.found} firme: ${r.newCount} noi${r.duplicates ? `, ${r.duplicates} le aveai deja` : ''}. Acum le verific site-urile…`)
      await load()
      setBusy('')
      await auditAll()
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : String(e))
      setBusy('')
    }
  }

  const patchRow = (id: string, p: Partial<Lead>) => setRows(rs => rs && rs.map(r => (r.id === id ? { ...r, ...p } : r)))

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-[22px] font-semibold text-slate-900">Găsește clienți în UK</h1>
      <ol className="mt-2 mb-4 text-[13px] text-slate-600 space-y-0.5 list-decimal pl-5">
        <li>Alegi <b>orașul</b> și <b>meseria</b>, apeși <b>Caută firme</b>.</li>
        <li>Aplicația ia firmele de pe Google și le <b>verifică site-ul</b> singură (durează ~1 minut).</li>
        <li>Pentru fiecare firmă vezi <b>ce probleme are</b> (în română) și apeși <b>Scrie mesajul</b> → <b>WhatsApp</b>.</li>
      </ol>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs text-slate-500 mb-1">Oraș</span>
            <Select value={city} onChange={e => setCity(e.target.value)}>{ALL_CITIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></label>
          <label className="block"><span className="block text-xs text-slate-500 mb-1">Meserie</span>
            <Select value={category} onChange={e => setCategory(e.target.value)}>{UK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{CATEGORY_RO[c.key] || c.label}</option>)}</Select></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="flex-1 h-11 text-base" loading={busy === 'search'} disabled={!!busy} onClick={search}>🔎 Caută firme</Button>
          {pending > 0 && <Button className="h-11" loading={busy === 'audit'} disabled={!!busy} onClick={auditAll}>Verifică site-urile ({pending})</Button>}
        </div>
        {info && <p className="text-sm text-teal-800">{info}</p>}
        {err && <p className="text-sm text-rose-700">{err}{/Google Places key/i.test(err) && <> — <Link href="/settings" className="underline">pune cheia Google în Setări</Link></>}</p>}
      </section>

      <div className="flex items-center justify-between mt-5 mb-2">
        <h2 className="text-sm font-semibold text-slate-700">{rows ? `${rows.length} firme` : 'Se încarcă…'} · {CATEGORY_RO[category]} în {city}</h2>
        <Select className="w-44 h-8 text-xs" value={show} onChange={e => setShow(e.target.value as 'todo' | 'all')}>
          <option value="todo">De contactat</option><option value="all">Toate</option>
        </Select>
      </div>

      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
          {show === 'todo' ? 'Nicio firmă de contactat aici. Apasă „Caută firme” sau alege alt oraș / altă meserie.' : 'Nicio firmă salvată încă pentru acest oraș și această meserie.'}
        </p>
      )}

      <div className="space-y-3">
        {rows?.map(r => <LeadCard key={r.id} r={r} sender={keys.sender} onChange={p => patchRow(r.id, p)} onDone={load} />)}
      </div>
    </div>
  )
}

function LeadCard({ r, sender, onChange, onDone }: { r: Lead; sender: string; onChange: (p: Partial<Lead>) => void; onDone: () => void }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<Msg | null>(r.message)
  const [text, setText] = useState(r.message?.whatsapp_en || '')
  const [showRo, setShowRo] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const st = STATUS_RO[r.website_status] || STATUS_RO.UNVERIFIED
  const wa = waNumber(r.phone_e164)
  const score = r.opportunity_score

  async function write(force = false) {
    setBusy('write'); setErr('')
    try {
      const res = await api<{ output: Msg }>('/api/crm/ai', { json: { kind: 'quick', business_id: r.id, sender: sender || undefined, force } })
      setMsg(res.output); setText(res.output.whatsapp_en); setShowRo(true)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function setWa(status: 'FOUND' | 'NOT_FOUND') {
    onChange({ whatsapp_status: status, whatsapp_source: 'manual' })
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { whatsapp_status: status } }).catch(() => {})
  }
  async function sent(channel: string) {
    setBusy('sent')
    try {
      await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'contacted', channel, notes: text.slice(0, 500), schedule_follow_ups: true } })
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function notFit() {
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { stage: 'not_a_fit' } }).catch(() => {})
    onDone()
  }

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 leading-snug">{r.name}</h3>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.google_rating != null && <>★ {Number(r.google_rating).toFixed(1)} ({r.google_review_count || 0} recenzii) · </>}{r.city}
            {r.stage !== 'new_lead' && r.stage !== 'reviewed' && r.stage !== 'ready_to_contact' && <> · <b>{r.stage === 'contacted' ? 'contactat' : r.stage}</b></>}
          </div>
        </div>
        {score != null && (
          <div className="text-right shrink-0">
            <div className={cx('inline-flex items-center justify-center min-w-[42px] h-7 px-2 rounded-md text-sm font-semibold', score >= 80 ? 'bg-teal-700 text-white' : score >= 60 ? 'bg-teal-100 text-teal-900' : score >= 40 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>{score}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">șanse /100</div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
        {r.whatsapp_status === 'FOUND' && <Badge tone="good">✓ Are WhatsApp</Badge>}
        {r.whatsapp_status === 'NOT_FOUND' && r.whatsapp_source === 'manual' && <Badge tone="bad">✗ Nu are WhatsApp</Badge>}
      </div>
      <p className="text-[12px] text-slate-500 mt-1">{st.hint}</p>

      {!!r.findings?.length && (
        <ul className="mt-2 space-y-1">
          {r.findings.slice(0, 4).map(f => <li key={f.code} className="text-[13px] text-slate-700 flex gap-1.5"><span className="text-rose-500">•</span>{findingRo(f.code, f.what)}</li>)}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {r.phone && <a href={`tel:${r.phone_e164 || r.phone}`} className="px-3 h-9 inline-flex items-center rounded-lg border border-slate-300">📞 {r.phone}</a>}
        {r.google_maps_url && <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="px-3 h-9 inline-flex items-center rounded-lg border border-slate-300">🗺️ Google Maps</a>}
        {r.website_url && <a href={r.website_url} target="_blank" rel="noreferrer" className="px-3 h-9 inline-flex items-center rounded-lg border border-slate-300 max-w-[200px] truncate">🌐 Site</a>}
        <Link href={`/crm/leads/${r.id}`} className="px-3 h-9 inline-flex items-center rounded-lg text-slate-500">Detalii →</Link>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {!msg ? (
          <Button variant="primary" className="w-full h-10" loading={busy === 'write'} onClick={() => write()}>✍️ Scrie mesajul (engleză + traducere)</Button>
        ) : (
          <div className="space-y-2">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed" />
            <button className="text-xs text-teal-700 underline" onClick={() => setShowRo(v => !v)}>{showRo ? 'Ascunde traducerea' : 'Ce spune mesajul? (traducere în română)'}</button>
            {showRo && (
              <div className="rounded-lg bg-slate-50 p-2 text-[13px] text-slate-700 whitespace-pre-wrap">
                {msg.whatsapp_ro}
                {msg.finding_used_ro && <div className="mt-2 text-xs text-slate-500">De ce: {msg.finding_used_ro}</div>}
              </div>
            )}
            {wa ? (
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] text-white font-semibold whitespace-nowrap">
                📱 Deschide WhatsApp · +44 {wa.slice(2, 6)} {wa.slice(6)}
              </a>
            ) : (
              <p className="text-xs text-slate-500">{r.phone ? 'Număr fix — WhatsApp merge doar pe mobil (07…). Sună sau trimite email.' : 'Nu are telefon în Google.'}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-10" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copiat ✓' : 'Copiază'}</Button>
              {r.email && <a href={`mailto:${r.email}?subject=${encodeURIComponent(msg.email_subject_en)}&body=${encodeURIComponent(msg.email_en)}`} className="h-10 px-3 inline-flex items-center rounded-lg border border-slate-300 text-sm">✉️ Email</a>}
              <Button size="sm" variant="ghost" className="h-10" loading={busy === 'write'} onClick={() => write(true)}>↻ Alt mesaj</Button>
            </div>
            {wa && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                După ce deschizi WhatsApp: numărul are WhatsApp?
                <button className={cx('px-2 h-7 rounded-md border', r.whatsapp_status === 'FOUND' && r.whatsapp_source === 'manual' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300')} onClick={() => setWa('FOUND')}>✓ Da</button>
                <button className={cx('px-2 h-7 rounded-md border', r.whatsapp_status === 'NOT_FOUND' && r.whatsapp_source === 'manual' ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-300')} onClick={() => setWa('NOT_FOUND')}>✗ Nu</button>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" loading={busy === 'sent'} onClick={() => sent(wa && r.whatsapp_status !== 'NOT_FOUND' ? 'whatsapp' : r.email ? 'email' : 'phone')}>✅ Am trimis mesajul</Button>
              <Button size="sm" variant="ghost" onClick={notFit}>Nu e potrivit</Button>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-rose-700 mt-2">{err}</p>}
      </div>
    </article>
  )
}
