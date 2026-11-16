'use client'

// Pagina simplă, în română: alegi orașul și meseria → aplicația caută firmele pe Google,
// le verifică site-ul și îți arată, pentru fiecare, problemele și butoanele de contact.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/crm/client'
import { Button, Select, Badge, cx } from '@/components/crm/ui'
import { categoriesFor, citiesFor, waDigits, type Country } from '@/lib/crm/countries'
import { STATUS_RO, findingRo, CATEGORY_RO, MANUAL_PROBLEMS } from '@/lib/crm/ro'
import { TEMPLATES, DEMO_STATUSES, buildMessages, type UkTemplates } from '@/lib/crm/uk-templates'
import { getSettings as getAppSettings } from '@/lib/storage'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Keys { google: string; anthropic: string }
interface Lead {
  id: string; name: string; category: string; city: string; address: string | null; full_address: string | null; google_place_id: string | null; preview_url: string | null
  phone: string | null; phone_e164: string | null; email: string | null
  website_url: string | null; website_status: string; whatsapp_status: string; whatsapp_source: string | null
  google_rating: number | null; google_review_count: number | null; google_maps_url: string | null
  opportunity_score: number | null; stage: string; findings: { code: string; what: string }[] | null; audited_at: string | null
  manual_problems: string[] | null
}

// eticheta în română a unei meserii, pentru țara dată
const catRo = (country: Country, key: string) => country === 'HU' ? (categoriesFor('HU').find(c => c.key === key)?.ro || key) : (CATEGORY_RO[key] || key)
const TPL_KEY = (country: Country) => (country === 'UK' ? 'uk_templates' : `${country.toLowerCase()}_templates`)

export default function HuntPage({ country }: { country: Country }) {
  const cities = citiesFor(country)
  const cats = categoriesFor(country)
  const regionOf = (c: string) => cities.find(x => x.city === c)?.region || null
  const [city, setCity] = useState(cities[0].city)
  const [category, setCategory] = useState(cats[0].key)
  const [show, setShow] = useState<'pool' | 'followup' | 'todo' | 'all'>('pool')
  const [manualOpen, setManualOpen] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [keys, setKeys] = useState<Keys>({ google: '', anthropic: '' })
  const [templates, setTemplates] = useState<UkTemplates>(TEMPLATES[country])

  useEffect(() => {
    const s = getAppSettings()
    setKeys({ google: s.googlePlacesApiKey || '', anthropic: s.anthropicApiKey || '' })
    try {
      const saved = JSON.parse(localStorage.getItem(TPL_KEY(country)) || 'null')
      setTemplates({ ...TEMPLATES[country], ...(s.senderName ? { me: s.senderName.split(' ')[0] } : {}), ...(saved || {}) })
    } catch { /* ignore */ }
  }, [country])
  const saveTemplates = (t: UkTemplates) => { setTemplates(t); try { localStorage.setItem(TPL_KEY(country), JSON.stringify(t)) } catch { /* ignore */ } }

  const load = useCallback(async () => {
    try {
      const d = await api<{ rows: Lead[]; pendingAudits: number }>(`/api/crm/simple?country=${country}&city=${encodeURIComponent(city)}&category=${category}&show=${show}`)
      setErr('')
      setRows(d.rows); setPending(d.pendingAudits)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [country, city, category, show])
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
        json: { country, city, region: regionOf(city), category, limit: 20, min_reviews: 3, google_api_key: keys.google || undefined },
      })
      setShow('todo')
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
      <h1 className="text-[22px] font-semibold text-slate-900">Găsește clienți în {country === 'HU' ? 'Ungaria 🇭🇺' : 'UK 🇬🇧'}</h1>
      <ol className="mt-2 mb-4 text-[13px] text-slate-600 space-y-0.5 list-decimal pl-5">
        <li>Aplicația caută <b>singură prin {country === 'HU' ? 'toată Ungaria' : 'tot UK-ul'}</b> până ai <b>50 de firme fără site / cu site de refăcut</b>, cu număr de mobil — întâi meseriile care plătesc cel mai probabil acum (iarna) și doar afaceri active (rating ≥ 4).</li>
        <li>La fiecare: <b>verifici WhatsApp-ul</b> (✓/✗). Cele fără WhatsApp ies din listă și apeși din nou <b>Completează până la 50</b>.</li>
        <li>Trimiți <b>mesajul în 2 părți</b>, faci <b>demo-ul</b> site-ului pentru el și îi trimiți linkul.</li>
      </ol>

      <HuntPanel country={country} googleKey={keys.google} onProgress={() => { if (show === 'pool') load() }} />

      <button className="mt-3 text-sm text-slate-600 underline" onClick={() => setManualOpen(v => !v)}>{manualOpen ? 'Ascunde căutarea manuală' : 'Sau caută manual într-un oraș / o meserie anume'}</button>
      {manualOpen && <section className="mt-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs text-slate-500 mb-1">Oraș</span>
            <Select value={city} onChange={e => setCity(e.target.value)}>{cities.map(c => <option key={c.city} value={c.city}>{c.city}</option>)}</Select></label>
          <label className="block"><span className="block text-xs text-slate-500 mb-1">Meserie</span>
            <Select value={category} onChange={e => setCategory(e.target.value)}>{cats.map(c => <option key={c.key} value={c.key}>{catRo(country, c.key)}</option>)}</Select></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="flex-1 h-11 text-base" loading={busy === 'search'} disabled={!!busy} onClick={search}>🔎 Caută firme</Button>
          {pending > 0 && <Button className="h-11" loading={busy === 'audit'} disabled={!!busy} onClick={auditAll}>Verifică site-urile ({pending})</Button>}
        </div>
        {info && <p className="text-sm text-teal-800">{info}</p>}
        {err && <p className="text-sm text-rose-700">{err}{/Google Places key/i.test(err) && <> — <Link href="/settings" className="underline">pune cheia Google în Setări</Link></>}</p>}
      </section>}

      <TemplateEditor value={templates} defaults={TEMPLATES[country]} onChange={saveTemplates} />

      <div className="flex items-center justify-between mt-5 mb-2">
        <h2 className="text-sm font-semibold text-slate-700">{rows ? `${rows.length} firme` : 'Se încarcă…'}{show === 'pool' ? ' · lista zilei' : show === 'followup' ? ' · contactați / interesați' : ` · ${catRo(country, category)} în ${city}`}</h2>
        <Select className="w-48 h-8 text-xs" value={show} onChange={e => setShow(e.target.value as 'pool' | 'followup' | 'todo' | 'all')}>
          <option value="pool">Lista zilei (cu mobil)</option><option value="followup">Contactați / interesați</option><option value="todo">De contactat — orașul ales</option><option value="all">Toate — orașul ales</option>
        </Select>
      </div>

      {sentNote && (
        <div className="mb-3 rounded-lg bg-teal-50 border border-teal-200 p-2.5 text-[13px] text-teal-900 flex items-center justify-between gap-2">
          <span>✅ {sentNote} a trecut la „Contactați / interesați”. Când răspunde, îl găsești acolo (demo, „E interesat”).</span>
          <button className="underline whitespace-nowrap" onClick={() => { setShow('followup'); setSentNote('') }}>Vezi lista</button>
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
          {show === 'followup' ? 'Nu ai încă firme contactate.' : show === 'pool' ? 'Lista zilei e goală. Apasă „Completează până la 50”.' : show === 'todo' ? 'Nicio firmă de contactat aici. Apasă „Caută firme” sau alege alt oraș / altă meserie.' : 'Nicio firmă salvată încă pentru acest oraș și această meserie.'}
        </p>
      )}

      <div className="space-y-3">
        {rows?.map(r => <LeadCard key={r.id} r={r} country={country} templates={templates} keys={keys} onChange={p => patchRow(r.id, p)} onDone={load} onSent={n => setSentNote(n)} />)}
      </div>
    </div>
  )
}

function LeadCard({ r, country, templates, keys, onChange, onDone, onSent }: { r: Lead; country: Country; templates: UkTemplates; keys: Keys; onChange: (p: Partial<Lead>) => void; onDone: () => void; onSent?: (name: string) => void }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const [showPrice, setShowPrice] = useState(false)
  const [demo, setDemo] = useState<{ step: string; started?: number } | null>(null)
  const st = STATUS_RO[r.website_status] || STATUS_RO.UNVERIFIED
  const wa = waDigits(r.phone_e164)
  const mobile = !!wa
  const noWa = r.whatsapp_status === 'NOT_FOUND' && r.whatsapp_source === 'manual'
  const score = r.opportunity_score
  const trades = (categoriesFor(country).find(c => c.key === r.category)?.label || (country === 'HU' ? 'vállalkozások' : 'businesses')).toLowerCase()
  const autoCodes = (r.findings || []).map(f => f.code)
  const problemCodes = r.manual_problems && r.manual_problems.length ? r.manual_problems : autoCodes
  const ownSite = !!r.website_url && !['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(r.website_status)
  const [siteOpen, setSiteOpen] = useState(false)
  const [siteUrl, setSiteUrl] = useState('')
  const [siteMsg, setSiteMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const contacted = !['new_lead', 'researching', 'qualified', 'reviewed', 'ready_to_contact'].includes(r.stage)
  const msgs = buildMessages(templates, { name: r.name, trades, website_status: r.website_status, findingCodes: problemCodes, previewUrl: r.preview_url, country })
  const [first, setFirst] = useState(msgs.first)
  const [second, setSecond] = useState(msgs.second)
  useEffect(() => { setFirst(msgs.first); setSecond(msgs.second) }, [msgs.first, msgs.second])
  const waLink = (text?: string) => `https://wa.me/${wa}${text ? `?text=${encodeURIComponent(text)}` : ''}`
  const canDemo = DEMO_STATUSES.includes(r.website_status)
  const jobKey = `uk_demo_job_${r.id}`

  const copy = (key: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) }
  async function setWa(status: 'FOUND' | 'NOT_FOUND') {
    onChange({ whatsapp_status: status, whatsapp_source: 'manual' })
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { whatsapp_status: status } }).catch(() => {})
  }
  async function sent(channel: string) {
    setBusy('sent')
    try { await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'contacted', channel, notes: `${first}\n\n${second}`.slice(0, 1000), schedule_follow_ups: true } }); onSent?.(r.name); onDone() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function addSite() {
    setBusy('site'); setErr(''); setSiteMsg('Verific site-ul…')
    try {
      const res = await api<{ website_url: string; status: string; findingCodes: string[]; reachable: boolean }>(`/api/crm/leads/${r.id}/site`, { json: { url: siteUrl } })
      const st2 = STATUS_RO[res.status] || STATUS_RO.UNVERIFIED
      setSiteMsg(res.reachable ? `Gata: ${st2.label}. Bifează mai jos ce nu e ok — mesajul se adaptează.` : 'Site-ul n-a putut fi deschis automat. Uită-te tu la el și bifează problemele mai jos.')
      setSiteOpen(false); setSiteUrl('')
      onChange({ website_url: res.website_url, website_status: res.status, manual_problems: null, findings: res.findingCodes.map(code => ({ code, what: code })) })
    } catch (e) { setSiteMsg(''); setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function toggleProblem(code: string) {
    const current = r.manual_problems && r.manual_problems.length ? r.manual_problems : autoCodes.filter(c => MANUAL_PROBLEMS.some(p => p.code === c))
    const next = current.includes(code) ? current.filter(c => c !== code) : [...current, code]
    const status = next.length && ['GOOD_WEBSITE', 'UNVERIFIED'].includes(r.website_status) ? 'NEEDS_REDESIGN' : r.website_status
    onChange({ manual_problems: next, website_status: status })
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { manual_problems: next } }).catch(() => {})
  }
  async function setStage(stage: string, note: string) {
    setBusy(stage)
    try {
      if (stage === 'interested') await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'reply', reply_status: 'positive', channel: mobile ? 'whatsapp' : 'phone' } })
      else await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { stage } })
      onChange({ stage })
      setInfoMsg(note)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function notFit() {
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { stage: 'not_a_fit' } }).catch(() => {})
    onDone()
  }

  // ── Demo: ca la Rebuild RO — conținutul site-ului actual (dacă există) + pozele și recenziile
  //    din Google → site concept generat de Claude pe server → publicat pe un link /p/…
  async function waitForJob(jobId: string): Promise<string> {
    for (let i = 0; i < 90; i++) {
      await new Promise(res => setTimeout(res, 5000))
      setDemo(d => ({ step: `Generez site-ul… ${Math.round((i + 1) * 5 / 60 * 10) / 10} min (durează 1–4 min, poți lăsa pagina deschisă)`, started: d?.started }))
      const s = await (await fetch(`/api/generate-redesign?job=${jobId}`, { cache: 'no-store' })).json()
      if (s.status === 'done') return s.html as string
      if (s.status === 'error') throw new Error(s.error || 'Generarea a eșuat')
    }
    throw new Error('Generarea durează prea mult — apasă din nou „Fă demo” peste un minut.')
  }
  async function publish(html: string) {
    setDemo({ step: 'Public demo-ul…' })
    const res = await fetch('/api/publish-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, businessName: r.name, designer: templates.me, lang: country === 'HU' ? 'hu' : 'en', existingUrl: r.preview_url || '' }) })
    const d = await res.json()
    if (!res.ok) throw new Error(d.code === 'no_blob' ? 'Hostingul de preview (Vercel Blob) nu e conectat.' : d.error || 'Publicarea a eșuat')
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { preview_url: d.url } })
    onChange({ preview_url: d.url })
    try { localStorage.removeItem(jobKey) } catch { /* ignore */ }
    setDemo(null)
  }
  async function makeDemo() {
    setErr(''); setDemo({ step: 'Citesc site-ul actual și pozele din Google…', started: Date.now() })
    try {
      const ownSite = r.website_url && !['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(r.website_status)
      let audit: Record<string, unknown> = { url: r.website_url || '', final_url: r.website_url || '', phones: r.phone ? [r.phone] : [], emails: r.email ? [r.email] : [], title: '', description: '', headings: [], text_excerpt: '', logo_url: '', images: [], socials: r.website_url && !ownSite ? [r.website_url] : [], issues: [] }
      if (ownSite) {
        const res = await fetch('/api/audit-site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: r.website_url }) })
        const d = await res.json()
        if (res.ok && d.audit) audit = d.audit
      }
      const lead = {
        place_id: r.google_place_id || '', name: r.name, address: r.full_address || r.address || r.city, city: r.city,
        category: r.category, category_label: categoriesFor(country).find(c => c.key === r.category)?.query || r.category,
        phone: r.phone || '', phone_intl: r.phone_e164 || '', website: ownSite ? r.website_url : '', no_site: !ownSite,
        rating: Number(r.google_rating || 0), reviews_count: r.google_review_count || 0, audit,
      }
      setDemo({ step: 'Pornesc generarea…', started: Date.now() })
      const res = await fetch('/api/generate-redesign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, language: country === 'HU' ? 'hu' : 'en', googleApiKey: keys.google || undefined, anthropicApiKey: keys.anthropic || undefined }) })
      const type = res.headers.get('content-type') || ''
      if (!type.includes('json')) throw new Error('Pentru demo trebuie conectat Vercel Blob (ca la Rebuild).')
      const d = await res.json()
      if (!res.ok || !d.jobId) throw new Error(d.error || 'Nu am putut porni generarea')
      try { localStorage.setItem(jobKey, d.jobId) } catch { /* ignore */ }
      await publish(await waitForJob(d.jobId))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setDemo(null) }
  }
  // dacă pagina a fost reîncărcată în timpul generării, continuăm același job
  useEffect(() => {
    let job: string | null = null
    try { job = localStorage.getItem(jobKey) } catch { /* ignore */ }
    if (!job || r.preview_url) return
    setDemo({ step: 'Continui generarea începută…' })
    waitForJob(job).then(publish).catch(e => { setErr(e instanceof Error ? e.message : String(e)); setDemo(null); try { localStorage.removeItem(jobKey) } catch { /* ignore */ } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Btn = ({ href, onClick, children, green, disabled }: { href?: string; onClick?: () => void; children: React.ReactNode; green?: boolean; disabled?: boolean }) => {
    const cls = cx('h-10 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap', green ? 'bg-[#25D366] text-white' : 'border border-slate-300 text-slate-700 bg-white', disabled && 'opacity-40 pointer-events-none')
    return href ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <button onClick={onClick} className={cls}>{children}</button>
  }

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 leading-snug">{r.name}</h3>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.google_rating != null && <>★ {Number(r.google_rating).toFixed(1)} ({r.google_review_count || 0} recenzii) · </>}{r.city}
            {contacted && <> · <b className={r.stage === 'interested' ? 'text-teal-700' : r.stage === 'won' ? 'text-emerald-700' : ''}>{r.stage === 'interested' ? 'interesat' : r.stage === 'won' ? 'client' : r.stage === 'replied' ? 'a răspuns' : 'contactat'}</b></>}
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
        {r.phone ? <Badge tone={mobile ? 'info' : 'neutral'}>{mobile ? '📱 Mobil' : '☎️ Fix'}</Badge> : <Badge>Fără telefon</Badge>}
        {r.whatsapp_status === 'FOUND' && <Badge tone="good">✓ Are WhatsApp</Badge>}
        {noWa && <Badge tone="bad">✗ Nu are WhatsApp</Badge>}
        {r.preview_url && <Badge tone="accent">🎨 Demo gata</Badge>}
      </div>
      <p className="text-[12px] text-slate-500 mt-1">{st.hint}</p>
      {!!r.findings?.length && (
        <ul className="mt-2 space-y-1">
          {r.findings.slice(0, 4).map(f => <li key={f.code} className="text-[13px] text-slate-700 flex gap-1.5"><span className="text-rose-500">•</span>{findingRo(f.code, f.what)}</li>)}
        </ul>
      )}

      {/* 1. Verificare */}
      <Step n={1} title="Verificare">
        <div className="flex flex-wrap gap-2">
          {mobile && <Btn green href={waLink()}>💬 Verifică WhatsApp</Btn>}
          {r.phone && <Btn href={`tel:${r.phone_e164 || r.phone}`}>📞 {r.phone}</Btn>}
          <Btn href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${r.city}`)}`}>🔎 Caută pe Google</Btn>
          {r.google_maps_url && <Btn href={r.google_maps_url}>🗺️ Maps</Btn>}
          {r.website_url && <Btn href={r.website_url}>🌐 Site</Btn>}
        </div>
        {mobile && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            S-a deschis chatul (are WhatsApp)?
            <button className={cx('px-2.5 h-8 rounded-md border', r.whatsapp_status === 'FOUND' && r.whatsapp_source === 'manual' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300')} onClick={() => setWa('FOUND')}>✓ Da</button>
            <button className={cx('px-2.5 h-8 rounded-md border', noWa ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-300')} onClick={() => setWa('NOT_FOUND')}>✗ Nu</button>
          </div>
        )}
        {/* Site găsit pe Google, deși profilul nu-l arată */}
        {!ownSite && (
          <div className="mt-3">
            {!siteOpen ? (
              <button className="text-xs text-teal-700 underline" onClick={() => setSiteOpen(true)}>🌐 Are totuși site (l-ai găsit pe Google)? Adaugă linkul</button>
            ) : (
              <div className="flex gap-2">
                <input value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="ex. www.firma.co.uk" inputMode="url" autoCapitalize="none"
                  className="flex-1 min-w-0 h-10 rounded-lg border border-slate-300 px-2 text-sm" />
                <Button size="sm" variant="primary" className="h-10" loading={busy === 'site'} disabled={!siteUrl.trim()} onClick={addSite}>Verifică</Button>
              </div>
            )}
          </div>
        )}
        {siteMsg && <p className="mt-2 text-xs text-teal-800">{siteMsg}</p>}
        {ownSite && (
          <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
            <div className="text-[12px] font-medium text-slate-700 mb-1.5">Ce nu e ok la site? <span className="font-normal text-slate-500">(bifează ce vezi — mesajul folosește primele 2)</span></div>
            <div className="grid gap-1">
              {MANUAL_PROBLEMS.map(p => {
                const on = (r.manual_problems && r.manual_problems.length ? r.manual_problems : autoCodes).includes(p.code)
                return (
                  <label key={p.code} className="flex items-start gap-2 text-[13px] text-slate-700">
                    <input type="checkbox" className="mt-0.5 w-4 h-4" checked={on} onChange={() => toggleProblem(p.code)} />
                    <span>{p.ro}{!r.manual_problems?.length && autoCodes.includes(p.code) ? <span className="text-[11px] text-slate-400"> · găsit la audit</span> : null}</span>
                  </label>
                )
              })}
            </div>
            {r.website_status === 'GOOD_WEBSITE' && !r.manual_problems?.length && <p className="text-[11px] text-slate-500 mt-1.5">Auditul zice că site-ul e bun. Dacă tu vezi probleme, bifează-le și firma rămâne în listă; dacă nu, apasă „Nu e potrivit”.</p>}
            <button className="mt-1.5 text-[11px] text-slate-500 underline" onClick={() => setSiteOpen(v => !v)}>Alt link pentru site?</button>
            {siteOpen && (
              <div className="flex gap-2 mt-1.5">
                <input value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="linkul corect" inputMode="url" autoCapitalize="none" className="flex-1 min-w-0 h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                <Button size="sm" className="h-9" loading={busy === 'site'} disabled={!siteUrl.trim()} onClick={addSite}>Verifică</Button>
              </div>
            )}
          </div>
        )}
        {!mobile && r.phone && <p className="text-xs text-slate-500 mt-2">Număr fix — WhatsApp merge doar pe mobil ({country === 'HU' ? '+36 20/30/31/50/70…' : '07…'}). Sună sau trimite email{r.email ? ` (${r.email})` : ''}.</p>}
      </Step>

      {/* 2. Mesaj în 2 părți scurte */}
      <Step n={2} title={`Mesaj (2 părți scurte, în ${country === 'HU' ? 'maghiară' : 'engleză'})`}>
        <label className="block text-[11px] text-slate-500 mb-1">Partea 1 — se deschide direct în WhatsApp</label>
        <textarea value={first} onChange={e => setFirst(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2 mt-1.5">
          {mobile && !noWa && <Btn green href={waLink(first)}>📱 Trimite partea 1 pe WhatsApp</Btn>}
          <Btn onClick={() => copy('1', first)}>{copied === '1' ? 'Copiat ✓' : 'Copiază'}</Btn>
        </div>
        <label className="block text-[11px] text-slate-500 mt-3 mb-1">Partea 2 — o lipești imediat după (sau după ce răspunde)</label>
        <textarea value={second} onChange={e => setSecond(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2 mt-1.5">
          <Btn onClick={() => copy('2', second)}>{copied === '2' ? 'Copiat ✓' : '📋 Copiază partea 2'}</Btn>
          {r.email && <Btn href={`mailto:${r.email}?subject=${encodeURIComponent(`A quick idea for ${r.name}`)}&body=${encodeURIComponent(`${first}\n\n${second}`)}`}>✉️ Email</Btn>}
        </div>
        <button className="mt-2 text-xs text-teal-700 underline" onClick={() => setShowPrice(v => !v)}>{showPrice ? 'Ascunde' : 'Dacă răspunde că e interesat → mesajul despre preț'}</button>
        {showPrice && (
          <div className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[13px] text-slate-700 whitespace-pre-wrap">
            {msgs.price}
            <div className="mt-2"><Btn onClick={() => copy('p', msgs.price)}>{copied === 'p' ? 'Copiat ✓' : 'Copiază'}</Btn></div>
          </div>
        )}
      </Step>

      {/* 3. Demo stilizat pe afacerea lui */}
      {canDemo && (
        <Step n={3} title="Demo site pentru el (ca la Rebuild)">
          {r.preview_url ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Btn href={r.preview_url}>👀 Vezi demo-ul</Btn>
                {mobile && !noWa && <Btn green href={waLink(msgs.demo)}>📱 Trimite demo-ul pe WhatsApp</Btn>}
                <Btn onClick={() => copy('d', msgs.demo)}>{copied === 'd' ? 'Copiat ✓' : 'Copiază mesajul cu link'}</Btn>
              </div>
              <button className="text-xs text-slate-500 underline" disabled={!!demo} onClick={makeDemo}>↻ Refă demo-ul (păstrează același link)</button>
            </div>
          ) : demo ? (
            <p className="text-sm text-teal-800 flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />{demo.step}</p>
          ) : (
            <>
              <Button variant="primary" className="w-full h-10" onClick={makeDemo}>🎨 Fă demo site pentru {r.name}</Button>
              <p className="text-[11px] text-slate-400 mt-1">Site concept în {country === 'HU' ? 'maghiară' : 'engleză'}, cu pozele și recenziile lui reale din Google{r.website_url && !['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(r.website_status) ? ' și textele de pe site-ul actual' : ''}. Primești un link live.</p>
            </>
          )}
        </Step>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
        {!contacted
          ? <Button size="sm" variant="primary" loading={busy === 'sent'} onClick={() => sent(mobile && !noWa ? 'whatsapp' : r.email ? 'email' : 'phone')}>✅ Am trimis mesajul</Button>
          : r.stage !== 'interested'
            ? <Button size="sm" variant="primary" loading={busy === 'interested'} onClick={() => setStage('interested', 'Marcat ca interesat — fă demo-ul mai sus și trimite-i linkul.')}>🙋 E interesat</Button>
            : <Button size="sm" loading={busy === 'won'} onClick={() => setStage('won', 'Felicitări! Marcat ca client câștigat.')}>🏆 A acceptat (client)</Button>}
        {contacted && <Button size="sm" variant="ghost" loading={busy === 'new_lead'} onClick={() => setStage('new_lead', 'L-am pus înapoi în lista zilei.')}>↩ Înapoi în listă</Button>}
        <Button size="sm" variant="ghost" onClick={notFit}>Nu e potrivit</Button>
        <Link href={`/crm/leads/${r.id}`} className="h-8 px-2 inline-flex items-center text-[13px] text-slate-500">Detalii →</Link>
      </div>
      {infoMsg && <p className="text-xs text-teal-800 mt-2">{infoMsg}</p>}
      {err && <p className="text-xs text-rose-700 mt-2">{err}</p>}
    </article>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 pt-3 border-t border-slate-100">
      <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2"><span className="inline-flex w-5 h-5 mr-1.5 items-center justify-center rounded-full bg-slate-900 text-white text-[11px]">{n}</span>{title}</h4>
      {children}
    </section>
  )
}

function TemplateEditor({ value, defaults, onChange }: { value: UkTemplates; defaults: UkTemplates; onChange: (t: UkTemplates) => void }) {
  const [open, setOpen] = useState(false)
  const field = (k: keyof UkTemplates, label: string, rows = 3) => (
    <label className="block">
      <span className="block text-[11px] text-slate-500 mb-0.5">{label}</span>
      {rows === 1 ? <input value={value[k]} onChange={e => onChange({ ...value, [k]: e.target.value })} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        : <textarea value={value[k]} onChange={e => onChange({ ...value, [k]: e.target.value })} rows={rows} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />}
    </label>
  )
  return (
    <section className="mt-3 bg-white border border-slate-200 rounded-xl p-3">
      <button className="text-sm font-medium text-slate-700 w-full text-left" onClick={() => setOpen(v => !v)}>✏️ Mesajele tale (șabloane) {open ? '▲' : '▼'}</button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">Se completează singure: {'{me}'} = numele tău, {'{name}'} = firma, {'{trades}'} = meseria (plumbers…), {'{problem}'} = problema găsită la site, {'{link}'} = linkul demo-ului. Se salvează pe acest telefon.</p>
          {field('me', 'Numele tău', 1)}
          {field('intro_nosite', 'Partea 1 — firmă fără site')}
          {field('intro_social', 'Partea 1 — doar Facebook / director')}
          {field('intro_site', 'Partea 1 — are site, dar cu probleme')}
          {field('offer', 'Partea 2 — oferta pentru cei FĂRĂ site + cine ești', 6)}
          {field('offer_site', 'Partea 2 — oferta pentru cei CU site slab (refacere modernă) + cine ești', 6)}
          {field('price', 'Dacă e interesat — prețul')}
          {field('demo', 'După demo — mesajul cu linkul')}
          <Button size="sm" variant="ghost" onClick={() => onChange(defaults)}>Revino la textele inițiale</Button>
        </div>
      )}
    </section>
  )
}

interface HuntInfo {
  pool: number; target: number; newToday: number; dailyNewMax: number; googleCostToday: number; googleRequestsToday: number
  pendingAudits: number; placesMode: 'auto' | 'new' | 'legacy'; serverKey: boolean; maxSteps: number
  state: { steps_today: number; last_auto_at?: string; log: string[] }
}

function HuntPanel({ country, googleKey, onProgress }: { country: Country; googleKey: string; onProgress: () => void }) {
  const [info, setInfo] = useState<HuntInfo | null>(null)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const stop = useRef(false)
  const refresh = useCallback(async () => { try { setInfo(await api<HuntInfo>(`/api/crm/hunt?country=${country}`)) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } }, [country])
  useEffect(() => { refresh() }, [refresh])

  async function run() {
    setRunning(true); setErr(''); stop.current = false
    try {
      for (let i = 0; i < 60 && !stop.current; i++) {
        if (i === 0) setMsg('Caut…')
        const r = await api<{ pool: number; target: number; done: boolean; stoppedReason?: string; ran?: { city: string; category: string; found: number; newCount: number }; error?: string; log: string[] }>('/api/crm/hunt', { json: { country, google_api_key: googleKey || undefined } })
        setInfo(x => x && { ...x, pool: r.pool, target: r.target, state: { ...x.state, log: r.log } })
        onProgress()
        if (r.ran) setMsg(`${catRo(country, r.ran.category)} · ${r.ran.city}: ${r.ran.newCount} noi cu mobil`)
        if (r.done) { setMsg(`Gata: lista zilei are ${r.pool} firme.`); break }
        if (r.stoppedReason === 'daily_limit') { setMsg('Am atins limita zilnică de firme noi (o poți mări în Settings & API → Limits).'); break }
        if (r.stoppedReason === 'step_limit') { setMsg('Am atins limita de căutări pe azi.'); break }
        if (r.stoppedReason === 'error') { setErr(r.error || 'Eroare la Google'); break }
      }
      if (stop.current) setMsg('Oprit.')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setRunning(false)
    refresh(); onProgress()
  }

  const pct = info ? Math.min(100, Math.round((info.pool / info.target) * 100)) : 0
  return (
    <section className="bg-slate-900 text-white rounded-xl p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Lista zilei</div>
          <div className="text-3xl font-semibold tabular-nums">{info ? info.pool : '…'}<span className="text-slate-500 text-xl"> / {info?.target ?? 50}</span></div>
          <div className="text-[12px] text-slate-400">firme fără site / cu site de refăcut, cu mobil, necontactate</div>
        </div>
        {running
          ? <Button className="h-11" onClick={() => { stop.current = true }}>⏸ Oprește</Button>
          : <Button variant="primary" className="h-11 bg-teal-500 hover:bg-teal-400 text-slate-950" disabled={!info || info.pool >= info.target} onClick={run}>▶ Completează până la {info?.target ?? 50}</Button>}
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-teal-400 transition-all" style={{ width: `${pct}%` }} /></div>
      {(msg || running) && <p className="mt-2 text-sm text-teal-200 flex items-center gap-2">{running && <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />}{msg || 'Caut…'}</p>}
      {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
      {info && (
        <div className="mt-3 text-[12px] text-slate-400 space-y-0.5">
          <div>Azi: {info.state.steps_today} căutări · {info.newToday} firme noi salvate · cost Google estimat ${info.googleCostToday.toFixed(2)}</div>
          <div>{info.placesMode === 'legacy'
            ? <>API Google vechi (~$0.40 la 20 de firme). Activează „Places API (New)” în Google Cloud și costă de ~10 ori mai puțin — aplicația trece singură pe el.</>
            : info.placesMode === 'new' ? <>API Google nou (ieftin: un apel pentru 20 de firme).</> : <>Prima căutare verifică ce API Google e activ la cheia ta.</>}</div>
          <div>Automat în fiecare dimineață ({country === 'HU' ? '~8:10 ora Ungariei' : '~7:40 ora UK'}): {info.serverKey ? <>activ{info.state.last_auto_at ? ` · ultima rulare ${new Date(info.state.last_auto_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</> : <>pune <b>GOOGLE_PLACES_API_KEY</b> în Vercel (Settings → Environment Variables) ca să meargă singur.</>}</div>
          {info.pendingAudits > 0 && <div>Site-uri de verificat: {info.pendingAudits} (se verifică la următorul pas)</div>}
          {!!info.state.log.length && (
            <details className="mt-1"><summary className="cursor-pointer text-slate-300">Ce am căutat azi ({info.state.log.length})</summary>
              <ul className="mt-1 space-y-0.5">{info.state.log.slice().reverse().map((l, i) => <li key={i}>• {l}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
