'use client'

// Pagina simplă, în română: alegi orașul și meseria → aplicația caută firmele pe Google,
// le verifică site-ul și îți arată, pentru fiecare, problemele și butoanele de contact.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/crm/client'
import { Button, Select, Badge, cx } from '@/components/crm/ui'
import { categoriesFor, citiesFor, waDigits, type Country } from '@/lib/crm/countries'
import { STATUS_RO, findingRo, CATEGORY_RO, MANUAL_PROBLEMS } from '@/lib/crm/ro'
import { TEMPLATES, DEMO_STATUSES, buildMessages, variantIndex, type UkTemplates } from '@/lib/crm/uk-templates'
import { getSettings as getAppSettings } from '@/lib/storage'
import { DIRECTIONS, directionById } from '@/lib/crm/design-directions'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Keys { google: string; anthropic: string }
interface Lead {
  id: string; name: string; category: string; city: string; address: string | null; full_address: string | null; google_place_id: string | null; preview_url: string | null
  phone: string | null; phone_e164: string | null; email: string | null
  website_url: string | null; website_status: string; whatsapp_status: string; whatsapp_source: string | null
  google_rating: number | null; google_review_count: number | null; google_maps_url: string | null
  opportunity_score: number | null; stage: string; findings: { code: string; what: string }[] | null; audited_at: string | null
  manual_problems: string[] | null
  demo_style?: string | null
  next_follow_up_at: string | null; contacted_at: string | null
  demo_status: string | null; demo_error: string | null; demo_started_at: string | null
}

// eticheta în română a unei meserii, pentru țara dată
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `acum ${Math.max(1, m)} min` : m < 1440 ? `acum ${Math.round(m / 60)} h` : Math.round(m / 1440) === 1 ? 'acum o zi' : `acum ${Math.round(m / 1440)} zile`
}
const catRo = (country: Country, key: string) => country === 'UK' ? (CATEGORY_RO[key] || key) : (categoriesFor(country).find(c => c.key === key)?.ro || key)
interface ReplyHelp { translation_ro: string; intent: string; intent_explained_ro: string; objection_type: string; suggested_reply_en: string; suggested_reply_ro: string; next_step: string }
type Show = 'pool' | 'waiting' | 'interested' | 'won' | 'followup' | 'todo' | 'all' | 'area'
interface AreaRun { region: string; city: string; category: string; cursor: number; total: number; added: number }
interface Stats { contacted: number; replied: number; interested: number; won: number; followups_due: number; contacted_today: number }
const COUNTRY_TITLE: Record<Country, string> = { UK: 'UK 🇬🇧', HU: 'Ungaria 🇭🇺', RO: 'România 🇷🇴' }
const LANG_RO: Record<Country, string> = { UK: 'engleză', HU: 'maghiară', RO: 'română' }
// varianta veche a mesajelor (cu „student / proiect la facultate”), salvată pe telefon înainte de schimbare
const OLD_TEXTS = /university student|egyetemista|proiect la facultate|firmele locale să crească|below market price to help local businesses|70 000 Ft-tól indulnak|ca să ajut afacerile să crească/
// Ce WhatsApp deschid butoanele verzi (Android): Business / normal / ce alege telefonul.
// Secure Folder nu poate fi deschis din afara lui: acolo aplicația trebuie deschisă din browserul din Secure Folder.
type WaApp = 'business' | 'personal' | 'auto'
const WA_DEFAULT: Record<Country, WaApp> = { HU: 'business', RO: 'personal', UK: 'auto' }
const WA_PKG: Record<Exclude<WaApp, 'auto'>, string> = { business: 'com.whatsapp.w4b', personal: 'com.whatsapp' }
export function waHref(digits: string, text: string | undefined, app: WaApp, android: boolean) {
  const web = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
  if (app === 'auto' || !android) return web
  const q = `phone=${digits}${text ? `&text=${encodeURIComponent(text)}` : ''}`
  return `intent://send/?${q}#Intent;scheme=whatsapp;package=${WA_PKG[app]};S.browser_fallback_url=${encodeURIComponent(web)};end`
}
const TPL_KEY = (country: Country) => (country === 'UK' ? 'uk_templates' : `${country.toLowerCase()}_templates`)

export default function HuntPage({ country }: { country: Country }) {
  const cities = citiesFor(country)
  const cats = categoriesFor(country)
  const regionOf = (c: string) => cities.find(x => x.city === c)?.region || null
  const [city, setCity] = useState(cities[0].city)
  const [category, setCategory] = useState(cats[0].key)
  const [show, setShow] = useState<Show>('pool')
  const [quick, setQuick] = useState(false)
  const [query, setQuery] = useState('')
  const [searchQ, setSearchQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setSearchQ(query.trim()), 300); return () => clearTimeout(t) }, [query])
  const searching = searchQ.length >= 2
  const [stats, setStats] = useState<Stats | null>(null)
  const regions = Array.from(new Set(cities.map(c => c.region)))
  const [region, setRegion] = useState(regions[0])
  const [areaCity, setAreaCity] = useState('')
  const [areaCat, setAreaCat] = useState('all')
  const [areaTotal, setAreaTotal] = useState<number | null>(null)
  const [area, setArea] = useState<AreaRun | null>(null)
  const [areaRunning, setAreaRunning] = useState(false)
  const stopArea = useRef(false)
  const AREA_KEY = `area_${country}`
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(AREA_KEY) || 'null'); if (v && typeof v.cursor === 'number') setArea(v) } catch { /* ignore */ } }, [AREA_KEY])
  useEffect(() => {
    setAreaTotal(null)
    api<{ total: number }>(`/api/crm/area?country=${country}&region=${encodeURIComponent(region)}&city=${encodeURIComponent(areaCity)}&category=${areaCat}`).then(d => setAreaTotal(d.total)).catch(() => {})
  }, [country, region, areaCity, areaCat])
  const areaView = area || { region, city: areaCity, category: areaCat }
  const [manualOpen, setManualOpen] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [keys, setKeys] = useState<Keys>({ google: '', anthropic: '' })
  const [templates, setTemplates] = useState<UkTemplates>(TEMPLATES[country])
  const [waApp, setWaAppState] = useState<WaApp>(WA_DEFAULT[country])
  useEffect(() => { try { const v = localStorage.getItem(`wa_app_${country}`); if (v === 'business' || v === 'personal' || v === 'auto') setWaAppState(v) } catch { /* ignore */ } }, [country])
  const setWaApp = (v: WaApp) => { setWaAppState(v); try { localStorage.setItem(`wa_app_${country}`, v) } catch { /* ignore */ } }

  useEffect(() => {
    const s = getAppSettings()
    setKeys({ google: s.googlePlacesApiKey || '', anthropic: s.anthropicApiKey || '' })
    try {
      const saved = JSON.parse(localStorage.getItem(TPL_KEY(country)) || 'null')
      if (saved && OLD_TEXTS.test(`${saved.offer || ''} ${saved.offer_site || ''} ${saved.intro_nosite || ''}`)) { const me = saved.me; for (const k of Object.keys(saved)) delete saved[k]; if (me) saved.me = me; localStorage.setItem(TPL_KEY(country), JSON.stringify(saved)) }
      // în România numele e „Grig” (nu numele din Setări / vechiul „Geri”)
      if (country === 'RO' && saved && (!saved.me || saved.me === 'Geri')) { saved.me = 'Grig'; localStorage.setItem(TPL_KEY(country), JSON.stringify(saved)) }
      setTemplates({ ...TEMPLATES[country], ...(s.senderName && country !== 'RO' ? { me: s.senderName.split(' ')[0] } : {}), ...(saved || {}) })
    } catch { /* ignore */ }
  }, [country])
  const saveTemplates = (t: UkTemplates) => { setTemplates(t); try { localStorage.setItem(TPL_KEY(country), JSON.stringify(t)) } catch { /* ignore */ } }

  const load = useCallback(async () => {
    try {
      const d = await api<{ rows: Lead[]; pendingAudits: number }>(searching
        ? `/api/crm/simple?country=${country}&show=search&q=${encodeURIComponent(searchQ)}`
        : show === 'area'
        ? `/api/crm/simple?country=${country}&show=area&region=${encodeURIComponent(areaView.region)}&city=${encodeURIComponent(areaView.city)}&category=${areaView.category}`
        : `/api/crm/simple?country=${country}&city=${encodeURIComponent(city)}&category=${category}&show=${show}`)
      setErr('')
      setRows(d.rows); setPending(d.pendingAudits)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [country, city, category, show, searching, searchQ, areaView.region, areaView.city, areaView.category])
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

  // Caută pe o zonă întreagă: pas cu pas (oraș × meserie), doar firme fără site, cu mobil
  async function runArea(resume: boolean) {
    let st: AreaRun = resume && area && area.cursor < area.total ? area : { region, city: areaCity, category: areaCat, cursor: 0, total: areaTotal || 0, added: 0 }
    if (!st.total) return
    setArea(st); setAreaRunning(true); stopArea.current = false; setShow('area'); setErr(''); setInfo('Caut pe Google…')
    while (!stopArea.current && st.cursor < st.total) {
      try {
        const r = await api<{ cursor: number; total: number; done: boolean; ran?: { city: string; category: string; found: number; newCount: number }; stoppedReason?: string; error?: string }>('/api/crm/area', {
          json: { country, region: st.region, city: st.city || null, category: st.category, cursor: st.cursor, google_api_key: keys.google || undefined },
        })
        st = { ...st, cursor: r.cursor, total: r.total, added: st.added + (r.ran?.newCount || 0) }
        setArea(st); try { localStorage.setItem(AREA_KEY, JSON.stringify(st)) } catch { /* ignore */ }
        if (r.ran) setInfo(`${catRo(country, r.ran.category)} · ${r.ran.city}: ${r.ran.newCount} noi fără site`)
        if (r.stoppedReason === 'daily_limit') { setErr('Ai atins limita zilnică de firme noi (Setări → limite). Apasă „Continuă” mâine, de unde ai rămas.'); break }
        if (r.stoppedReason === 'error' && /key|REQUEST_DENIED|403|billing/i.test(r.error || '')) { setErr(`Google: ${r.error}`); break }
        await load()
      } catch (e) { setErr(e instanceof ApiError || e instanceof Error ? e.message : String(e)); break }
    }
    if (st.cursor >= st.total) setInfo(`Gata: am căutat în toată zona — ${st.added} firme noi fără site.`)
    setAreaRunning(false)
  }

  const patchRow = (id: string, p: Partial<Lead>) => setRows(rs => rs && rs.map(r => (r.id === id ? { ...r, ...p } : r)))

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {([['UK', '/crm/gaseste', '🇬🇧 UK'], ['HU', '/crm/ungaria', '🇭🇺 Ungaria'], ['RO', '/crm/romania', '🇷🇴 România']] as const).map(([c, href, label]) => (
          <Link key={c} href={href} className={cx('px-3.5 h-9 inline-flex items-center rounded-full text-sm font-medium whitespace-nowrap border', c === country ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300')}>{label}</Link>
        ))}
      </div>
      <h1 className="text-[22px] font-semibold text-slate-900">Găsește clienți în {COUNTRY_TITLE[country]}</h1>
      <ol className="mt-2 mb-4 text-[13px] text-slate-600 space-y-0.5 list-decimal pl-5 hidden sm:block">
        <li>Aplicația caută <b>singură prin {country === 'HU' ? 'toată Ungaria' : country === 'RO' ? 'toată România' : 'tot UK-ul'}</b> până lista zilei e plină cu <b>firme fără site / cu site de refăcut</b>, cu număr de mobil — întâi meseriile care plătesc cel mai probabil acum (iarna) și doar afaceri active (rating ≥ 4).</li>
        <li>La fiecare: <b>verifici WhatsApp-ul</b> (✓/✗). Cele fără WhatsApp ies din listă (le poți trimite SMS) și apeși din nou <b>Completează</b>.</li>
        <li>Trimiți <b>mesajul în 2 părți</b>. Peste 2–3 zile, la <b>De revenit</b>, trimiți reamintirea. Cine e interesat → <b>demo</b> → link.</li>
      </ol>

      <HuntPanel country={country} googleKey={keys.google} onInfo={i => setStats(i.stats)} onProgress={() => { if (show === 'pool') load() }} />

      <button className="mt-3 text-sm text-slate-600 underline" onClick={() => setManualOpen(v => !v)}>{manualOpen ? 'Ascunde căutarea pe zonă' : '🗺️ Caută într-un oraș sau într-un județ întreg'}</button>
      {manualOpen && <section className="mt-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[13px] text-slate-600">Alege zona: aplicația caută <b>toate firmele fără site</b> (inclusiv cele doar cu Facebook), cu număr de mobil, oraș cu oraș și meserie cu meserie.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block col-span-2 sm:col-span-1"><span className="block text-xs text-slate-500 mb-1">{country === 'RO' ? 'Județ / zonă' : 'Zonă'}</span>
            <Select value={region} disabled={areaRunning} onChange={e => { setRegion(e.target.value); setAreaCity('') }}>{regions.map(r => <option key={r} value={r}>{r}</option>)}</Select></label>
          <label className="block col-span-2 sm:col-span-1"><span className="block text-xs text-slate-500 mb-1">Oraș</span>
            <Select value={areaCity} disabled={areaRunning} onChange={e => setAreaCity(e.target.value)}><option value="">Toată zona ({cities.filter(c => c.region === region).length} orașe)</option>{cities.filter(c => c.region === region).map(c => <option key={c.city} value={c.city}>{c.city}</option>)}</Select></label>
          <label className="block col-span-2"><span className="block text-xs text-slate-500 mb-1">Meserie</span>
            <Select value={areaCat} disabled={areaRunning} onChange={e => setAreaCat(e.target.value)}><option value="all">Toate meseriile ({cats.length})</option>{cats.map(c => <option key={c.key} value={c.key}>{catRo(country, c.key)}</option>)}</Select></label>
        </div>
        {areaTotal != null && !areaRunning && <p className="text-[12px] text-slate-500">{areaTotal} căutări pe Google · aproximativ {Math.max(1, Math.round(areaTotal * 12 / 60))} minute (lasă pagina deschisă; poți opri și continua oricând).</p>}
        <div className="flex flex-wrap gap-2">
          {areaRunning
            ? <Button className="flex-1 h-11 text-base" onClick={() => { stopArea.current = true }}>⏸ Oprește</Button>
            : <Button variant="primary" className="flex-1 h-11 text-base" disabled={!areaTotal || !!busy} onClick={() => runArea(false)}>🔎 Caută toate firmele fără site</Button>}
          {!areaRunning && area && area.cursor > 0 && area.cursor < area.total && <Button className="h-11" onClick={() => runArea(true)}>▶ Continuă {area.city || area.region} ({area.cursor}/{area.total})</Button>}
          {!areaRunning && area && <Button className="h-11" onClick={() => setShow('area')}>📋 Vezi rezultatele</Button>}
        </div>
        {area && (areaRunning || area.cursor > 0) && (
          <div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round((area.cursor / Math.max(1, area.total)) * 100)}%` }} /></div>
            <p className="mt-1 text-[12px] text-slate-600">{area.city || `tot județul ${area.region}`} · {area.cursor}/{area.total} căutări · <b>{area.added} firme noi fără site</b></p>
          </div>
        )}
        {info && <p className="text-sm text-teal-800">{info}</p>}
        {err && <p className="text-sm text-rose-700">{err}{/Google Places key/i.test(err) && <> — <Link href="/settings" className="underline">pune cheia Google în Setări</Link></>}</p>}
      </section>}

      <TemplateEditor value={templates} defaults={TEMPLATES[country]} onChange={saveTemplates} />

      {quick && <QuickMode country={country} templates={templates} waApp={waApp} onExit={() => { setQuick(false); load() }} />}
      <button onClick={() => setQuick(true)} className="mt-5 w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold">⚡ Mod rapid — verifică seara, trimite dimineața</button>
      <div className="mt-3 relative">
        <input value={query} onChange={e => setQuery(e.target.value)} inputMode="search" placeholder="🔎 Caută după nume sau telefon (oricare firmă)"
          className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-[15px] text-slate-900 placeholder:text-slate-400" />
        {query && <button aria-label="Șterge căutarea" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-slate-500" onClick={() => setQuery('')}>✕</button>}
      </div>
      {searching && <div className="mt-2 mb-2 text-sm text-slate-600">{rows ? `${rows.length} ${rows.length === 1 ? 'rezultat' : 'rezultate'}` : 'Caut…'} pentru „{searchQ}” · <button className="underline" onClick={() => setQuery('')}>înapoi la liste</button></div>}
      <div className={cx('mt-3 mb-3 grid grid-cols-4 gap-1.5', searching && 'hidden')}>
        {([
          ['pool', '📋', 'Lista zilei', null],
          ['waiting', '⏰', 'De revenit', stats ? stats.contacted - stats.replied : null],
          ['interested', '🙋', 'Interesați', stats?.interested ?? null],
          ['won', '🏆', 'Clienți', stats?.won ?? null],
        ] as [Show, string, string, number | null][]).map(([k, icon, label, n]) => (
          <button key={k} onClick={() => setShow(k)} className={cx('rounded-xl border px-1 py-2 text-center', show === k ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-200 text-slate-700')}>
            <div className="text-base leading-none">{icon}</div>
            <div className="text-[11px] font-medium mt-1 leading-tight">{label}{n != null ? ` · ${n}` : ''}</div>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-600">
        <span>Butoanele deschid:</span>
        {([['business', 'WhatsApp Business'], ['personal', 'WhatsApp normal'], ['auto', 'Ce alege telefonul']] as [WaApp, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setWaApp(k)} className={cx('px-2 py-1 rounded-full border', waApp === k ? 'bg-[#25D366] border-[#25D366] text-white font-medium' : 'bg-white border-slate-300')}>{l}</button>
        ))}
        {waApp === 'auto' && <span className="w-full text-[11px] text-slate-500">Pentru WhatsApp-ul din Secure Folder: deschide aplicația din browserul din Secure Folder — atunci butoanele deschid WhatsApp-ul de acolo.</span>}
      </div>
      {show === 'waiting' && stats && stats.followups_due > 0 && <p className="mb-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⏰ {stats.followups_due} firme așteaptă reamintirea azi — sunt primele în listă.</p>}
      {show === 'area' && !searching && <div className="mb-2 text-sm text-slate-600">Firme fără site · {areaView.city || `tot județul ${areaView.region}`} · {areaView.category === 'all' ? 'toate meseriile' : catRo(country, areaView.category)}{rows ? ` · ${rows.length}` : ''} <button className="underline ml-1" onClick={() => setShow('pool')}>înapoi la lista zilei</button></div>}
      {(show === 'todo' || show === 'all') && <div className="mb-2 text-sm text-slate-600">Rezultatele căutării manuale · {catRo(country, category)} în {city} <button className="underline ml-1" onClick={() => setShow('pool')}>înapoi la lista zilei</button></div>}

      {sentNote && (
        <div className="mb-3 rounded-lg bg-teal-50 border border-teal-200 p-2.5 text-[13px] text-teal-900 flex items-center justify-between gap-2">
          <span>✅ {sentNote} a trecut la „⏰ De revenit”. Când răspunde, apeși acolo „🙋 Interesat” (sau „👎 A zis nu”).</span>
          <button className="underline whitespace-nowrap" onClick={() => { setShow('waiting'); setSentNote('') }}>Vezi lista</button>
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
          {searching ? `Nicio firmă găsită pentru „${searchQ}”. Încearcă doar o parte din nume sau ultimele cifre ale telefonului.` : show === 'waiting' ? 'Nimeni de revenit acum. După ce trimiți mesaje, firmele apar aici până răspund.' : show === 'interested' ? 'Încă niciun interesat. Când cineva răspunde, apasă „🙋 Interesat” pe cardul lui.' : show === 'won' ? 'Încă niciun client — urmează 🙂' : show === 'followup' ? 'Nu ai încă firme contactate.' : show === 'area' ? 'Încă nicio firmă fără site în zona asta. Apasă „Caută toate firmele fără site”.' : show === 'pool' ? 'Lista zilei e goală. Apasă „Completează”.' : show === 'todo' ? 'Nicio firmă de contactat aici. Apasă „Caută firme” sau alege alt oraș / altă meserie.' : 'Nicio firmă salvată încă pentru acest oraș și această meserie.'}
        </p>
      )}

      <div className="space-y-3">
        {rows?.map(r => <LeadCard key={r.id} r={r} country={country} templates={templates} keys={keys} waApp={waApp} onChange={p => patchRow(r.id, p)} onDone={load} onSent={n => setSentNote(n)} />)}
      </div>
    </div>
  )
}

async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('poză invalidă'))), 'image/jpeg', 0.82))
}

function leadMessages(r: Lead, templates: UkTemplates, country: Country) {
  const trades = (categoriesFor(country).find(c => c.key === r.category)?.label || (country === 'HU' ? 'vállalkozások' : 'businesses')).toLowerCase()
  const autoCodes = (r.findings || []).map(f => f.code)
  const problemCodes = r.manual_problems && r.manual_problems.length ? r.manual_problems : autoCodes
  return buildMessages(templates, { name: r.name, trades, website_status: r.website_status, findingCodes: problemCodes, previewUrl: r.preview_url, country, rating: r.google_rating, reviews: r.google_review_count, variant: variantIndex(r.id) })
}

// ── Mod rapid: câte o firmă pe ecran. Seara verifici WhatsApp-ul (fără ciornă), dimineața trimiți. ──
const TZ: Record<Country, string> = { UK: 'Europe/London', HU: 'Europe/Budapest', RO: 'Europe/Bucharest' }
function localHour(country: Country) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ[country] }).format(new Date()))
}

function QuickMode({ country, templates, waApp, onExit }: { country: Country; templates: UkTemplates; waApp: WaApp; onExit: () => void }) {
  const [phase, setPhase] = useState<'verify' | 'send'>(() => { const h = localHour(country); return h >= 9 && h < 19 ? 'send' : 'verify' })
  const [queue, setQueue] = useState<Lead[] | null>(null)
  const [i, setI] = useState(0)
  const [opened, setOpened] = useState(false)
  const [part, setPart] = useState(1)
  const [done, setDone] = useState({ ok: 0, no: 0, skip: 0 })
  const [err, setErr] = useState('')
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

  const load = useCallback(async () => {
    setQueue(null); setI(0); setOpened(false); setPart(1); setErr('')
    try {
      const pool = (await api<{ rows: Lead[] }>(`/api/crm/simple?country=${country}&show=pool`)).rows.filter(r => waDigits(r.phone_e164))
      if (phase === 'verify') setQueue(pool.filter(r => r.whatsapp_source !== 'manual'))
      else {
        const due = (await api<{ rows: Lead[] }>(`/api/crm/simple?country=${country}&show=waiting`)).rows
          .filter(r => waDigits(r.phone_e164) && r.next_follow_up_at && new Date(r.next_follow_up_at).getTime() <= Date.now() && !(r.whatsapp_status === 'NOT_FOUND' && r.whatsapp_source === 'manual'))
        setQueue([...pool.filter(r => r.whatsapp_status === 'FOUND' && r.whatsapp_source === 'manual'), ...due])
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [country, phase])
  useEffect(() => { load() }, [load])

  const r = queue?.[i]
  const next = (k: 'ok' | 'no' | 'skip') => { setDone(d => ({ ...d, [k]: d[k] + 1 })); setI(x => x + 1); setOpened(false); setPart(1) }
  const isFollow = !!r && ['contacted', 'follow_up_1', 'follow_up_2'].includes(r.stage)
  const msgs = r ? leadMessages(r, templates, country) : null
  const parts = !msgs ? [] : isFollow ? [msgs.followup] : [msgs.first, msgs.second].filter(t => t.trim())
  const wa = r ? waDigits(r.phone_e164) || '' : ''
  const hour = localHour(country)
  const badTime = phase === 'send' && (hour < 9 || hour >= 19)

  async function mark(status: 'FOUND' | 'NOT_FOUND') {
    if (!r) return
    api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { whatsapp_status: status } }).catch(() => {})
    next(status === 'FOUND' ? 'ok' : 'no')
  }
  async function sentIt() {
    if (!r) return
    try {
      if (isFollow) await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'follow_up', channel: 'whatsapp', notes: parts[0] } })
      else await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'contacted', channel: 'whatsapp', notes: parts.join('\n\n').slice(0, 1000), schedule_follow_ups: true } })
      next('ok')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function notFit() {
    if (!r) return
    api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { stage: 'not_a_fit' } }).catch(() => {})
    next('no')
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-slate-900">⚡ Mod rapid · {COUNTRY_TITLE[country]}</div>
          <button className="h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white" onClick={onExit}>✕ Închide</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {([['verify', '🌙 Verificare WhatsApp'], ['send', '☀️ Trimitere']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPhase(k)} className={cx('h-10 rounded-xl border text-sm font-medium', phase === k ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-200 text-slate-700')}>{l}</button>
          ))}
        </div>
        <p className="text-[12px] text-slate-500 mb-3">{phase === 'verify'
          ? 'Se deschide chatul FĂRĂ text (nu rămâne ciornă, nu se trimite nimic). Te întorci și apeși ✓ sau ✗.'
          : 'Doar firmele cu WhatsApp verificat + reamintirile de azi. Se deschide chatul cu mesajul scris: apeși săgeata, te întorci, apeși „Am trimis”.'}</p>
        {badTime && <p className="mb-3 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⏰ Acum e {hour}:00 în {COUNTRY_TITLE[country]}. Mesajele se trimit mai bine între 9:00 și 19:00, ora lor.</p>}
        {err && <p className="mb-3 text-sm text-rose-700">{err}</p>}
        {!queue ? <p className="text-sm text-slate-500">Se încarcă…</p>
          : !r ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <div className="font-semibold text-slate-900">Gata!</div>
              <p className="text-sm text-slate-600 mt-1">{phase === 'verify' ? `${done.ok} cu WhatsApp, ${done.no} fără. ` : `${done.ok} trimise. `}{done.skip ? `${done.skip} sărite.` : ''}</p>
              {phase === 'verify' && <p className="text-[12px] text-slate-500 mt-2">Dimineața, de la 9:00 (ora lor), intri pe ☀️ Trimitere.</p>}
              <div className="flex gap-2 justify-center mt-4">
                <Button onClick={load}>↻ Reîncarcă</Button>
                <Button variant="primary" onClick={onExit}>Înapoi la listă</Button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] text-slate-400 mb-1">{i + 1} din {queue.length}{isFollow ? ' · ⏰ reamintire' : ''}</div>
              <h3 className="text-lg font-semibold text-slate-900 leading-snug">{r.name}</h3>
              <p className="text-[13px] text-slate-500">{r.google_rating != null && <>★ {Number(r.google_rating).toFixed(1)} ({r.google_review_count || 0}) · </>}{catRo(country, r.category)} · {r.city}</p>
              <p className="text-[13px] text-slate-700 mt-1">📱 {r.phone || r.phone_e164}</p>
              {phase === 'verify' ? (
                <div className="mt-4 space-y-2">
                  <a href={waHref(wa, undefined, waApp, android)} target={waApp === 'auto' || !android ? '_blank' : undefined} rel="noreferrer" onClick={() => setOpened(true)} className="h-12 w-full inline-flex items-center justify-center rounded-xl bg-[#25D366] text-white font-semibold">💬 Deschide chatul (fără text)</a>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={cx('h-12 rounded-xl border-2 font-semibold', opened ? 'border-emerald-500 text-emerald-700' : 'border-slate-200 text-slate-600')} onClick={() => mark('FOUND')}>✓ Are WhatsApp</button>
                    <button className={cx('h-12 rounded-xl border-2 font-semibold', opened ? 'border-rose-400 text-rose-700' : 'border-slate-200 text-slate-600')} onClick={() => mark('NOT_FOUND')}>✗ Nu are</button>
                  </div>
                  <button className="w-full text-sm text-slate-500 py-1" onClick={() => next('skip')}>Sari peste</button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {parts.map((t, k) => (
                    <div key={k} className={cx('rounded-lg border p-2.5 text-[13px] whitespace-pre-wrap', part === k + 1 ? 'border-teal-300 bg-teal-50 text-slate-800' : 'border-slate-200 text-slate-500')}>{parts.length > 1 && <div className="text-[11px] font-medium mb-0.5">Partea {k + 1}</div>}{t}</div>
                  ))}
                  {part <= parts.length
                    ? <a href={waHref(wa, parts[part - 1], waApp, android)} target={waApp === 'auto' || !android ? '_blank' : undefined} rel="noreferrer" onClick={() => setTimeout(() => setPart(x => x + 1), 400)} className="h-12 w-full inline-flex items-center justify-center rounded-xl bg-[#25D366] text-white font-semibold">📱 {isFollow ? 'Trimite reamintirea' : parts.length > 1 ? `Trimite partea ${part}` : 'Trimite'}</a>
                    : <p className="text-[12px] text-slate-500 text-center">Ai deschis {parts.length > 1 ? 'ambele părți' : 'mesajul'}. L-ai trimis?</p>}
                  <Button variant="primary" className="w-full h-12" onClick={sentIt}>✅ Am trimis</Button>
                  <div className="grid grid-cols-3 gap-2">
                    <button className="h-10 rounded-lg border border-slate-300 text-[13px]" onClick={() => mark('NOT_FOUND')}>✗ N-are WA</button>
                    <button className="h-10 rounded-lg border border-slate-300 text-[13px]" onClick={notFit}>🚫 Nu e potrivit</button>
                    <button className="h-10 rounded-lg border border-slate-300 text-[13px]" onClick={() => next('skip')}>Sari</button>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  )
}

function LeadCard({ r, country, templates, keys, waApp, onChange, onDone, onSent }: { r: Lead; country: Country; templates: UkTemplates; keys: Keys; waApp: WaApp; onChange: (p: Partial<Lead>) => void; onDone: () => void; onSent?: (name: string) => void }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const [showPrice, setShowPrice] = useState(false)
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
  const [open, setOpen] = useState(false)
  const contacted = !['new_lead', 'researching', 'qualified', 'reviewed', 'ready_to_contact'].includes(r.stage)
  const msgs = buildMessages(templates, { name: r.name, trades, website_status: r.website_status, findingCodes: problemCodes, previewUrl: r.preview_url, country, rating: r.google_rating, reviews: r.google_review_count, variant: variantIndex(r.id) })
  const [first, setFirst] = useState(msgs.first)
  const [second, setSecond] = useState(msgs.second)
  useEffect(() => { setFirst(msgs.first); setSecond(msgs.second) }, [msgs.first, msgs.second])
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  const waLink = (text?: string) => waHref(wa || '', text, waApp, android)
  const canDemo = DEMO_STATUSES.includes(r.website_status)

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
  const waiting = ['contacted', 'follow_up_1', 'follow_up_2'].includes(r.stage)
  const followDue = waiting && !!r.next_follow_up_at && new Date(r.next_follow_up_at).getTime() <= Date.now()
  const smsLink = (text: string) => `sms:${r.phone_e164}?body=${encodeURIComponent(text)}`
  async function sentFollowUp() {
    setBusy('fu')
    try {
      await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'follow_up', channel: mobile && !noWa ? 'whatsapp' : 'sms', notes: msgs.followup } })
      onChange({ stage: r.stage === 'contacted' ? 'follow_up_1' : r.stage === 'follow_up_1' ? 'follow_up_2' : r.stage, next_follow_up_at: null })
      setInfoMsg('Reamintire notată. Dacă nu răspunde nici acum, îl poți lăsa.')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function replied(kind: 'positive' | 'negative') {
    setBusy(kind)
    try {
      await api(`/api/crm/leads/${r.id}/events`, { json: { event_type: 'reply', reply_status: kind, channel: mobile && !noWa ? 'whatsapp' : 'phone' } })
      if (kind === 'negative') onDone()
      else { onChange({ stage: 'interested' }); setOpen(true); setInfoMsg('Super! Fă-i demo-ul (pasul 3) și trimite-i linkul.') }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function notFit() {
    await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { stage: 'not_a_fit' } }).catch(() => {})
    onDone()
  }

  // ── Demo: rulează complet pe server (ca la Rebuild RO, cu pozele și recenziile lui din Google).
  //    Poți închide pagina: linkul apare singur pe firmă când e gata.
  const demoRunning = r.demo_status === 'running'
  const [editText, setEditText] = useState('')
  const [editing, setEditing] = useState(false)
  const [shots, setShots] = useState<string[]>([])
  const [shotBusy, setShotBusy] = useState(false)
  async function addShots(files: FileList | null) {
    if (!files?.length) return
    setShotBusy(true)
    const { upload } = await import('@vercel/blob/client')
    const urls: string[] = []
    for (const f of Array.from(files).slice(0, 4)) {
      try { const b = await upload(`edit-shots/${r.id}/${Date.now()}.jpg`, await shrinkImage(f), { access: 'public', handleUploadUrl: `/api/crm/leads/${r.id}/photos`, contentType: 'image/jpeg' }); urls.push(b.url) } catch { /* */ }
    }
    setShots(s => [...s, ...urls].slice(0, 4)); setShotBusy(false)
  }
  const FIX_TEXT = 'Repară afișarea pe telefon: titlurile secțiunilor (de exemplu „Locație”) nu au voie să apară peste bara de navigație (antet opac, z-index peste tot conținutul, scroll-margin-top); scoate orice buton plutitor de tip „Cere ofertă” / „Cere disponibilitatea” din mijlocul ecranului (păstrează doar bara fixă de jos cu Sună / WhatsApp); niciun spațiu mare gol: tot conținutul trebuie să fie vizibil și fără animații (animațiile doar îl aduc, nu îl ascund); nimic suprapus la 360–430px. Restul site-ului rămâne neschimbat.'
  async function applyEdits(text?: string) {
    setErr(''); setBusy('edit')
    try {
      await api(`/api/crm/leads/${r.id}/demo/edit`, { json: { instructions: text || editText, images: shots, anthropic_key: keys.anthropic || undefined, designer: templates.me } })
      setEditing(true); setEditText(''); setShots([])
      onChange({ demo_status: 'running', demo_error: null, demo_started_at: new Date().toISOString() })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  // poza demo-ului pentru WhatsApp: o pregătim când deschizi cardul, ca butonul să trimită instant
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null)
  const [shotState, setShotState] = useState<'' | 'loading' | 'error'>('')
  useEffect(() => {
    if (!open || !r.preview_url || demoRunning) return
    let gone = false
    const get = async () => { const res = await fetch(`/api/crm/leads/${r.id}/screenshot`, { cache: 'no-store' }); return res.ok ? res.blob() : null }
    ;(async () => {
      setShotState('loading')
      try {
        let blob = await get()
        if (!blob) { await api(`/api/crm/leads/${r.id}/screenshot`, { method: 'POST', json: {} }); blob = await get() }
        if (!blob || gone) { if (!gone) setShotState('error'); return }
        const file = new File([blob], `${r.name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'site'}.png`, { type: 'image/png' })
        setShot({ url: URL.createObjectURL(blob), file }); setShotState('')
      } catch { if (!gone) setShotState('error') }
    })()
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.preview_url, demoRunning, r.id])
  async function shareShot() {
    if (!shot) return
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.share && nav.canShare?.({ files: [shot.file] })) {
      try { await nav.share({ files: [shot.file] }) } catch { /* anulat */ }
    } else {
      const a = document.createElement('a'); a.href = shot.url; a.download = shot.file.name; a.click()
    }
  }
  const [photoCount, setPhotoCount] = useState<number | null>(null)
  const [uploadMsg, setUploadMsg] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  useEffect(() => {
    if (!open || !r.preview_url) return
    api<{ photos: string[] }>(`/api/crm/leads/${r.id}/photos`).then(d => setPhotoCount(d.photos.length)).catch(() => {})
  }, [open, r.preview_url, r.id])
  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return
    setErr('')
    const list = Array.from(files).slice(0, 100)
    const { upload } = await import('@vercel/blob/client')
    let ok = 0
    for (let k = 0; k < list.length; k++) {
      setUploadMsg(`Încarc pozele… ${k + 1} din ${list.length}`)
      try {
        const small = await shrinkImage(list[k])
        await upload(`client-photos/${r.id}/${k + 1}.jpg`, small, { access: 'public', handleUploadUrl: `/api/crm/leads/${r.id}/photos`, contentType: 'image/jpeg' })
        ok++
      } catch { /* o poză stricată nu oprește restul */ }
    }
    setUploadMsg(ok === list.length ? `Gata: ${ok} poze încărcate.` : `${ok} din ${list.length} poze încărcate (unele n-au mers).`)
    setPhotoCount(c => (c || 0) + ok)
  }
  async function applyPhotos() {
    setErr(''); setBusy('photos')
    try {
      await api(`/api/crm/leads/${r.id}/photos/apply`, { json: { note: photoNote || undefined, anthropic_key: keys.anthropic || undefined, designer: templates.me } })
      setEditing(true)
      onChange({ demo_status: 'running', demo_error: null, demo_started_at: new Date().toISOString() })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function deletePhotos() {
    if (!confirm('Ștergi toate pozele încărcate pentru această firmă?')) return
    await api(`/api/crm/leads/${r.id}/photos`, { method: 'DELETE' }).catch(() => {})
    setPhotoCount(0); setUploadMsg('')
  }
  // panoul clientului: link + PIN, de unde își schimbă singur tarifele, ofertele, pozele și contactul
  const [portal, setPortal] = useState<{ exists: boolean; link: string | null; ready: boolean; pin?: string; account?: { email: string; last_login_at: string | null } | null; live_url?: string | null; domain_auto?: boolean } | null>(null)
  const [liveUrl, setLiveUrl] = useState('')
  useEffect(() => {
    if (!open || !r.preview_url || !['won', 'interested', 'negotiation', 'proposal_sent', 'call_meeting', 'replied'].includes(r.stage)) return
    api<{ exists: boolean; link: string | null; ready: boolean; account: { email: string; last_login_at: string | null } | null; live_url: string | null; domain_auto: boolean }>(`/api/crm/leads/${r.id}/portal`).then(d => { setPortal(d); setLiveUrl(d.live_url || '') }).catch(() => {})
  }, [open, r.preview_url, r.stage, r.id, demoRunning])
  async function activatePortal() {
    setErr(''); setBusy('portal')
    try {
      const d = await api<{ link: string; pin: string; markup: string }>(`/api/crm/leads/${r.id}/portal`, { json: { anthropic_key: keys.anthropic || undefined, designer: templates.me } })
      setPortal(x => ({ ...(x || {}), exists: true, link: d.link, ready: d.markup === 'ready', pin: d.pin }))
      if (d.markup === 'running') { setEditing(true); onChange({ demo_status: 'running', demo_error: null, demo_started_at: new Date().toISOString() }) }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function prepareSite(force = false) {
    setErr(''); setBusy('prepare')
    try {
      const d = await api<{ markup: string }>(`/api/crm/leads/${r.id}/portal`, { json: { anthropic_key: keys.anthropic || undefined, designer: templates.me, prepare_only: true, force } })
      if (d.markup === 'running') { setEditing(true); onChange({ demo_status: 'running', demo_error: null, demo_started_at: new Date().toISOString() }) }
      else setPortal(x => (x ? { ...x, ready: true } : x))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  const reset = !!portal?.account
  const portalMsg = portal?.link && portal.pin ? (country === 'HU'
    ? (reset ? `Jó napot! Itt tud új jelszót beállítani a weboldal kezelőfelületéhez:\n${portal.link}\nKód: ${portal.pin}` : `Jó napot! Itt hozhatja létre a fiókját a weboldal kezelőfelületéhez (üzenetek az ügyfelektől, árak, ajánlatok, képek):\n${portal.link}\nAktiváló kód: ${portal.pin}\nBelépés után alkalmazásként telepítheti a telefonjára, és értesítést kap minden új üzenetről. 🙂`)
    : country === 'UK'
    ? (reset ? `Hi! You can set a new password for your website panel here:\n${portal.link}\nCode: ${portal.pin}` : `Hi! Create your account for your website panel here (customer messages, prices, offers, photos):\n${portal.link}\nActivation code: ${portal.pin}\nOnce in, you can install it on your phone as an app and get a notification for every new message. 🙂`)
    : (reset ? `Bună ziua! Aici vă puteți seta o parolă nouă pentru panoul site-ului:\n${portal.link}\nCod: ${portal.pin}` : `Bună ziua! Aici vă creați contul pentru panoul site-ului (mesajele de la clienți, tarife, oferte, poze):\n${portal.link}\nCod de activare: ${portal.pin}\nDupă ce intrați, îl puteți instala pe telefon ca aplicație și primiți notificare la fiecare mesaj nou. 🙂`)) : ''
  const [domainSetup, setDomainSetup] = useState(false)
  async function saveLive() {
    setBusy('live'); setErr(''); setDomainSetup(false)
    try {
      const d = await api<{ ok: boolean; domain: string; verified?: boolean; setup?: boolean }>(`/api/crm/leads/${r.id}/domain`, { json: { domain: liveUrl.trim() } })
      setLiveUrl(d.domain); setPortal(x => (x ? { ...x, live_url: `https://${d.domain}` } : x))
      if (d.setup) setDomainSetup(true)
      else setInfoMsg(`✓ ${d.domain} e legat de aplicație. În 2–10 minute site-ul apare pe domeniu (cu HTTPS) și de acum se actualizează singur.`)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  // formularul de pe site: unde ajung mesajele + ce a venit deja
  const [forms, setForms] = useState<{ recipient: string; fromPanel: boolean; emailReady: boolean; messages: { id: string; name: string; email: string; phone: string; message: string; created_at: string }[] } | null>(null)
  const [formEmail, setFormEmail] = useState('')
  useEffect(() => {
    if (!open || !r.preview_url) return
    api<NonNullable<typeof forms>>(`/api/crm/leads/${r.id}/messages`).then(d => { setForms(d); setFormEmail(d.recipient) }).catch(() => {})
  }, [open, r.preview_url, r.id])
  async function saveFormEmail() {
    setBusy('formEmail'); setErr('')
    try {
      await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', json: { email: formEmail.trim() } })
      setForms(f => f && { ...f, recipient: formEmail.trim() }); onChange({ email: formEmail.trim() || null })
      setInfoMsg('Emailul pentru formular a fost salvat.')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  const [replyText, setReplyText] = useState('')
  const [help, setHelp] = useState<ReplyHelp | null>(null)
  const [helpReply, setHelpReply] = useState('')
  async function askHelp() {
    setErr(''); setBusy('help')
    try {
      const offer = [msgs.price, country === 'UK' ? 'The website concept is already made and free, no obligation.' : country === 'HU' ? 'A weboldalterv már elkészült, ingyenes, semmire nem kötelez.' : 'Conceptul de site e deja făcut, gratuit, fără nicio obligație.',
        r.preview_url ? `Demo link: ${r.preview_url}` : 'The demo is not made yet (can be made in a few minutes).'].join('\n')
      const res = await api<{ output: ReplyHelp }>('/api/crm/ai', { json: {
        kind: 'reply', business_id: r.id, reply_text: replyText, sender: templates.me, offer,
        language: country === 'UK' ? 'British English' : country === 'HU' ? 'Hungarian (use informal "te" if they wrote informally, otherwise polite)' : 'Romanian (polite "dumneavoastră")',
        sent: second.trim() ? `${first}\n\n${second}` : first,
      } })
      setHelp(res.output); setHelpReply(res.output.suggested_reply_en)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  const [style, setStyle] = useState('auto')
  async function makeDemo() {
    setEditing(false)
    setErr(''); setBusy('demo')
    try {
      await api(`/api/crm/leads/${r.id}/demo`, { json: { anthropic_key: keys.anthropic || undefined, google_key: keys.google || undefined, designer: templates.me, style: style === 'auto' ? undefined : style } })
      onChange({ demo_status: 'running', demo_error: null, demo_started_at: new Date().toISOString(), demo_style: style === 'auto' ? r.demo_style : style })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  useEffect(() => {
    if (!demoRunning) return
    const t = setInterval(async () => {
      try {
        const d = await api<{ status: string | null; error: string | null; preview_url: string | null }>(`/api/crm/leads/${r.id}/demo`)
        if (d.status === 'done') onChange({ demo_status: 'done', preview_url: d.preview_url })
        else if (d.status === 'error') onChange({ demo_status: 'error', demo_error: d.error })
      } catch { /* reîncercăm la următorul pas */ }
    }, 12_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRunning, r.id])

  const Btn = ({ href, onClick, children, green, disabled }: { href?: string; onClick?: () => void; children: React.ReactNode; green?: boolean; disabled?: boolean }) => {
    const cls = cx('h-10 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap', green ? 'bg-[#25D366] text-white' : 'border border-slate-300 text-slate-700 bg-white', disabled && 'opacity-40 pointer-events-none')
    const external = href && !href.startsWith('intent:') && !href.startsWith('sms:')
    return href ? <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className={cls}>{children}</a> : <button onClick={onClick} className={cls}>{children}</button>
  }

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 leading-snug">{r.name}</h3>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.google_rating != null && <>★ {Number(r.google_rating).toFixed(1)} ({r.google_review_count || 0} recenzii) · </>}{r.city}
            {contacted && <> · <b className={r.stage === 'interested' ? 'text-teal-700' : r.stage === 'won' ? 'text-emerald-700' : ''}>{r.stage === 'interested' ? 'interesat' : r.stage === 'won' ? 'client' : r.stage === 'replied' ? 'a răspuns' : r.stage === 'follow_up_1' ? 'reamintit o dată' : r.stage === 'follow_up_2' ? 'reamintit de 2 ori' : 'contactat'}</b>{r.contacted_at ? <> · {ago(r.contacted_at)}</> : null}</>}
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
        {r.preview_url && !demoRunning && <Badge tone="accent">🎨 Demo gata</Badge>}
        {demoRunning && <Badge tone="info">⏳ Demo în lucru</Badge>}
      </div>
      {!open && (
        <>
          {(() => { const t = problemCodes.map(c => findingRo(c, '')).filter(Boolean); return t.length > 0 && <p className="text-[12px] text-slate-600 mt-1.5">• {t[0]}{t.length > 1 ? ` (+${t.length - 1})` : ''}</p> })()}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {!contacted && mobile && !noWa && r.whatsapp_status !== 'FOUND' && <>
              <Btn green href={waLink()}>💬 Verifică WhatsApp</Btn>
              <button className="h-10 px-3 rounded-lg border border-slate-300 text-sm" onClick={() => setWa('FOUND')}>✓ Are</button>
              <button className="h-10 px-3 rounded-lg border border-slate-300 text-sm" onClick={() => setWa('NOT_FOUND')}>✗ N-are</button>
            </>}
            {!contacted && (r.whatsapp_status === 'FOUND' || !mobile || noWa) && <Button variant="primary" className="h-10" onClick={() => setOpen(true)}>✍️ Scrie mesajul</Button>}
            {!contacted && noWa && <Btn href={smsLink(`${first}\n\n${second}`)}>✉️ SMS</Btn>}
            {!contacted && <button className={cx('h-10 px-3 rounded-lg text-sm', noWa ? 'border border-rose-300 text-rose-700 bg-rose-50' : 'text-slate-500')} onClick={notFit}>🚫 Nu e potrivit</button>}
            {waiting && <>
              {mobile && !noWa ? <Btn green href={waLink(msgs.followup)}>📱 Reamintire</Btn> : r.phone_e164 ? <Btn href={smsLink(msgs.followup)}>✉️ Reamintire SMS</Btn> : null}
              <button className="h-10 px-3 rounded-lg border border-slate-300 text-sm" disabled={busy === 'fu'} onClick={sentFollowUp}>Am trimis reamintirea</button>
              <Button variant="primary" className="h-10" loading={busy === 'positive'} onClick={() => replied('positive')}>🙋 Interesat</Button>
              <button className="h-10 px-3 rounded-lg text-sm text-slate-500" disabled={busy === 'negative'} onClick={() => replied('negative')}>👎 A zis nu</button>
            </>}
            {['replied', 'interested', 'call_meeting', 'proposal_sent', 'negotiation'].includes(r.stage) && <>
              {r.preview_url && !demoRunning && mobile && !noWa && <Btn green href={waLink(msgs.demo)}>📱 Trimite demo-ul</Btn>}
              <Button variant={r.preview_url ? 'secondary' : 'primary'} className="h-10" onClick={() => setOpen(true)}>{demoRunning ? '⏳ Demo în lucru' : r.preview_url ? 'Deschide' : '🎨 Fă demo-ul'}</Button>
              <button className="h-10 px-3 rounded-lg border border-slate-300 text-sm" disabled={busy === 'won'} onClick={() => setStage('won', 'Felicitări! Marcat ca client.')}>🏆 A acceptat</button>
            </>}
            {r.stage === 'won' && <Button className="h-10" onClick={() => setOpen(true)}>Deschide</Button>}
            {followDue && <span className="self-center text-[11px] text-amber-700">⏰ e momentul reamintirii</span>}
          </div>
          {infoMsg && <p className="text-xs text-teal-800 mt-2">{infoMsg}</p>}
          {err && <p className="text-xs text-rose-700 mt-2">{err}</p>}
        </>
      )}
      {open && <>
      <p className="text-[12px] text-slate-500 mt-1">{st.hint}</p>
      {!!r.findings?.length && (
        <ul className="mt-2 space-y-1">
          {r.findings.filter(f => findingRo(f.code, f.what)).slice(0, 4).map(f => <li key={f.code} className="text-[13px] text-slate-700 flex gap-1.5"><span className="text-rose-500">•</span>{findingRo(f.code, f.what)}</li>)}
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
      <Step n={2} title={second.trim() ? `Mesaj (2 părți scurte, în ${LANG_RO[country]})` : `Mesaj scurt (în ${LANG_RO[country]}) — demo-ul și prețul doar după ce răspunde „yes”`}>
        <label className="block text-[11px] text-slate-500 mb-1">Partea 1 — se deschide direct în WhatsApp</label>
        <textarea value={first} onChange={e => setFirst(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2 mt-1.5">
          {mobile && !noWa && <Btn green href={waLink(first)}>📱 Trimite partea 1 pe WhatsApp</Btn>}
          {mobile && noWa && <Btn href={smsLink(second.trim() ? `${first}\n\n${second}` : first)}>✉️ Trimite prin SMS</Btn>}
          <Btn onClick={() => copy('1', first)}>{copied === '1' ? 'Copiat ✓' : 'Copiază'}</Btn>
        </div>
        {!!msgs.second.trim() && <>
        <label className="block text-[11px] text-slate-500 mt-3 mb-1">Partea 2 — o lipești imediat după (sau după ce răspunde)</label>
        <textarea value={second} onChange={e => setSecond(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed" />
        </>}
        <div className="flex flex-wrap gap-2 mt-1.5">
          {!!msgs.second.trim() && <Btn onClick={() => copy('2', second)}>{copied === '2' ? 'Copiat ✓' : '📋 Copiază partea 2'}</Btn>}
          {r.email && <Btn href={`mailto:${r.email}?subject=${encodeURIComponent(country === 'HU' ? `Weboldal-ötlet – ${r.name}` : country === 'RO' ? `O idee pentru ${r.name}` : `A quick idea for ${r.name}`)}&body=${encodeURIComponent(`${first}\n\n${second}`)}`}>✉️ Email</Btn>}
        </div>
        {waiting && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <div className="text-[12px] font-medium text-amber-900 mb-1">⏰ Reamintire (dacă n-a răspuns în 2–3 zile)</div>
            <div className="text-[13px] text-slate-700 whitespace-pre-wrap">{msgs.followup}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {mobile && !noWa ? <Btn green href={waLink(msgs.followup)}>📱 Trimite pe WhatsApp</Btn> : r.phone_e164 ? <Btn href={smsLink(msgs.followup)}>✉️ Trimite SMS</Btn> : null}
              <Btn onClick={() => copy('f', msgs.followup)}>{copied === 'f' ? 'Copiat ✓' : 'Copiază'}</Btn>
              <Button size="sm" className="h-10" loading={busy === 'fu'} onClick={sentFollowUp}>Am trimis reamintirea</Button>
            </div>
          </div>
        )}
        <button className="mt-2 text-xs text-teal-700 underline" onClick={() => setShowPrice(v => !v)}>{showPrice ? 'Ascunde' : 'Dacă răspunde că e interesat → mesajul despre preț'}</button>
        {showPrice && (
          <div className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[13px] text-slate-700 whitespace-pre-wrap">
            {msgs.price}
            <div className="mt-2"><Btn onClick={() => copy('p', msgs.price)}>{copied === 'p' ? 'Copiat ✓' : 'Copiază'}</Btn></div>
          </div>
        )}
      </Step>

      {contacted && (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-2">
          <div className="text-[12px] font-medium text-sky-900">💬 Ți-a răspuns? Lipește mesajul lui aici</div>
          <textarea className="w-full min-h-[70px] rounded-md border border-slate-300 p-2 text-[13px] bg-white" placeholder="Lipește aici ce ți-a scris…" value={replyText} onChange={e => setReplyText(e.target.value)} />
          <Button size="sm" variant="primary" className="h-9" loading={busy === 'help'} disabled={replyText.trim().length < 2} onClick={askHelp}>Ce a zis și ce să-i răspund</Button>
          {help && (
            <div className="space-y-2 text-[13px]">
              <div><span className="text-[11px] text-slate-500">Ce a zis (în română):</span><div className="text-slate-800">{help.translation_ro}</div></div>
              <div className="text-[12px] text-slate-600">{help.intent_explained_ro}</div>
              <div><span className="text-[11px] text-slate-500">Răspunsul tău ({LANG_RO[country]}) — îl poți modifica:</span>
                <textarea className="w-full min-h-[90px] rounded-md border border-slate-300 p-2 text-[13px] bg-white" value={helpReply} onChange={e => setHelpReply(e.target.value)} /></div>
              {country !== 'RO' && <div><span className="text-[11px] text-slate-500">Ce înseamnă răspunsul:</span><div className="text-slate-600">{help.suggested_reply_ro}</div></div>}
              <div className="flex flex-wrap gap-2">
                {mobile && !noWa && <Btn green href={waLink(helpReply)}>📱 Trimite pe WhatsApp</Btn>}
                <Btn onClick={() => copy('h', helpReply)}>{copied === 'h' ? 'Copiat ✓' : 'Copiază'}</Btn>
              </div>
              {help.next_step && <p className="text-[12px] text-sky-900">👉 {help.next_step}</p>}
              {help.intent === 'interested' && r.stage !== 'interested' && r.stage !== 'won' && <Button size="sm" className="h-9" loading={busy === 'positive'} onClick={() => replied('positive')}>🙋 Marchează ca interesat</Button>}
            </div>
          )}
        </div>
      )}

      {/* 3. Demo stilizat pe afacerea lui */}
      {canDemo && (
        <Step n={3} title="Demo site pentru el (ca la Rebuild)">
          {demoRunning ? (
            <div className="rounded-lg bg-teal-50 border border-teal-200 p-2.5 text-[13px] text-teal-900">
              <div className="flex items-center gap-2 font-medium"><span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />{editing ? 'Se aplică modificările (1–4 minute)…' : 'Se generează demo-ul (1–4 minute)…'}</div>
              <div className="mt-1 text-[12px]">Poți închide aplicația sau trece la alte firme — linkul apare aici singur când e gata.</div>
            </div>
          ) : r.preview_url ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Btn href={r.preview_url}>👀 Vezi demo-ul</Btn>
                {mobile && !noWa && <Btn green href={waLink(msgs.demo)}>📱 Trimite demo-ul pe WhatsApp</Btn>}
                <Btn onClick={() => copy('d', msgs.demo)}>{copied === 'd' ? 'Copiat ✓' : 'Copiază mesajul cu link'}</Btn>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <div className="text-[12px] font-medium text-slate-700 mb-1.5">📷 Poza site-ului (o trimiți înaintea linkului)</div>
                {shot ? (
                  <div className="flex items-start gap-3">
                    <img src={shot.url} alt="" className="w-24 rounded-md border border-slate-200 shadow-sm" />
                    <div className="flex flex-col gap-2">
                      <Btn green onClick={shareShot}>📷 Trimite poza</Btn>
                      <a href={shot.url} download={shot.file.name} className="text-xs text-slate-500 underline">Descarcă poza</a>
                      <span className="text-[11px] text-slate-400">Alegi WhatsApp din listă, apoi chatul firmei.</span>
                    </div>
                  </div>
                ) : shotState === 'loading' ? <p className="text-[12px] text-slate-500 flex items-center gap-2"><span className="w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin" />Pregătesc poza…</p>
                  : shotState === 'error' ? <p className="text-[12px] text-slate-500">Poza n-a mers acum — deschide demo-ul și fă o captură de ecran.</p> : null}
              </div>
              {r.demo_status === 'error' && r.demo_error && <p className="text-xs text-rose-700">Ultima modificare n-a reușit: {r.demo_error}</p>}
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5 space-y-2">
                <div className="text-[12px] font-medium text-violet-900">🖼️ Pozele clientului{photoCount ? ` · ${photoCount} încărcate` : ''}</div>
                <label className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium bg-white border border-violet-300 text-violet-800 cursor-pointer">
                  ➕ Alege pozele din galerie
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { uploadPhotos(e.target.files); e.target.value = '' }} />
                </label>
                {uploadMsg && <p className="text-[12px] text-violet-900">{uploadMsg}</p>}
                {!!photoCount && <>
                  <input className="w-full h-9 rounded-md border border-slate-300 px-2 text-[13px] bg-white" placeholder="Opțional: ce să evidențieze (ex.: pozele cu salonul, nu cu oameni)" value={photoNote} onChange={e => setPhotoNote(e.target.value)} />
                  <Button size="sm" variant="primary" className="h-9" loading={busy === 'photos'} onClick={applyPhotos}>✨ Alege cele mai bune și pune-le în site</Button>
                  <button className="block text-[11px] text-slate-500 underline" onClick={deletePhotos}>Șterge pozele încărcate</button>
                </>}
                <p className="text-[11px] text-slate-500">Poți încărca până la 100 de poze (se micșorează automat). Claude le alege pe cele mai bune și le pune în site, pe același link. Costă un apel Claude mai mare (aprox. 1 $ la 100 de poze).</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="text-[12px] font-medium text-slate-700">✏️ Modificări cerute de client</div>
                <textarea className="w-full min-h-[70px] rounded-md border border-slate-300 p-2 text-[13px]" placeholder="Ex.: schimbă telefonul în 0722 000 000, adaugă programul L–V 8–18, scoate secțiunea cu prețuri, culoarea principală verde…" value={editText} onChange={e => setEditText(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  {shots.map(u => <img key={u} src={u} alt="" className="w-12 h-12 object-cover rounded-md border border-slate-200" />)}
                  <label className="h-9 px-3 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white text-[12px] text-slate-700 cursor-pointer">
                    {shotBusy ? 'Se încarcă…' : '📷 Adaugă captură cu problema'}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={shotBusy} onChange={e => { addShots(e.target.files); e.target.value = '' }} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" className="h-9" loading={busy === 'edit'} disabled={editText.trim().length < 3 && !shots.length} onClick={() => applyEdits(editText.trim() || 'Repară problemele care se văd în capturile de ecran.')}>Aplică modificările (același link)</Button>
                  <Button size="sm" className="h-9" loading={busy === 'edit'} onClick={() => applyEdits(FIX_TEXT)}>🛠️ Repară afișarea pe telefon</Button>
                </div>
                <p className="text-[11px] text-slate-400">Claude modifică site-ul pe server; poți închide pagina. Clientul vede schimbările pe același link.</p>
              </div>
              {forms && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-2">
                  <div className="text-[12px] font-medium text-sky-900">📩 Formularul de pe site{forms.messages.length ? ` · ${forms.messages.length} mesaje` : ''}</div>
                  {forms.fromPanel
                    ? <p className="text-[12px] text-slate-700">Emailul de notificare: <b>{forms.recipient}</b> (confirmat de client în aplicație).</p>
                    : <div className="flex gap-2">
                        <input className="flex-1 h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900" placeholder="Emailul firmei, unde ajung mesajele" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
                        <Button size="sm" className="h-9" loading={busy === 'formEmail'} disabled={formEmail.trim() === forms.recipient} onClick={saveFormEmail}>Salvează</Button>
                      </div>}
                  <p className="text-[12px] text-slate-600">Mesajele ajung în aplicația clientului, cu notificare pe telefon{forms.emailReady && forms.recipient ? ', și pe email' : ''}. Le vezi și aici.</p>
                  {forms.messages.slice(0, 5).map(m => (
                    <div key={m.id} className="rounded-md bg-white border border-slate-200 p-2 text-[12px]">
                      <div className="flex justify-between gap-2"><b>{m.name || m.email || m.phone}</b><span className="text-slate-400">{new Date(m.created_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
                      {m.message && <p className="text-slate-700 whitespace-pre-wrap">{m.message}</p>}
                      <p className="text-slate-500">{[m.phone, m.email].filter(Boolean).join(' · ')}</p>
                    </div>
                  ))}
                </div>
              )}
              {portal && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                  <div className="text-[12px] font-medium text-amber-900">📱 Aplicația clientului (mesaje, tarife, oferte, poze)</div>
                  {portal.account && <p className="text-[12px] text-emerald-800">✓ Are cont: <b>{portal.account.email}</b>{portal.account.last_login_at ? ` · ultima intrare ${new Date(portal.account.last_login_at).toLocaleDateString('ro-RO')}` : ''}</p>}
                  {portal.pin ? (
                    <>
                      <div className="text-[13px] text-slate-800 break-all">Link: <a className="underline" href={portal.link || '#'} target="_blank" rel="noreferrer">{portal.link}</a></div>
                      <div className="text-[13px] text-slate-800">Cod (PIN): <b className="tracking-widest">{portal.pin}</b> <span className="text-[11px] text-slate-500">— notează-l, nu mai apare a doua oară</span></div>
                      
                      <div className="flex flex-wrap gap-2">
                        {mobile && !noWa && <Btn green href={waLink(portalMsg)}>📱 Trimite clientului</Btn>}
                        <Btn onClick={() => copy('p', portalMsg)}>{copied === 'p' ? 'Copiat ✓' : 'Copiază mesajul'}</Btn>
                      </div>
                    </>
                  ) : portal.exists ? (
                    <p className="text-[12px] text-slate-700">{portal.account ? 'Clientul intră în aplicație cu emailul și parola lui, la adresa /client.' : 'Linkul de activare e trimis; clientul încă nu și-a creat contul.'} Dacă a uitat parola sau codul, fă un cod nou: cu același link își setează o parolă nouă.</p>
                  ) : <p className="text-[12px] text-slate-700">Clientul primește un link și un cod de 6 cifre, își face cont (email + parolă) și are o aplicație pe telefon: primește mesajele de pe site cu notificare, răspunde dintr-o atingere (telefon, WhatsApp, email) și își schimbă tarifele, ofertele, pozele și contactul. Site-ul se actualizează singur.</p>}
                  {portal.exists && !portal.ready && (
                    <div className="rounded-md bg-white border border-amber-300 p-2 space-y-1.5">
                      <p className="text-[12px] text-amber-900">{demoRunning ? 'Claude pregătește site-ul pentru editare (1–4 minute)…' : '⚠️ Site-ul nu are încă secțiunile editabile (tarife, oferte, galerie): clientul nu le poate schimba din aplicație.'}</p>
                      {!demoRunning && <Button size="sm" className="h-9" loading={busy === 'prepare'} onClick={() => prepareSite()}>🧩 Pregătește site-ul pentru editare</Button>}
                      <p className="text-[11px] text-slate-500">După ce e gata: descarcă din nou arhiva site-ului și pune-o pe Cloudflare (New deployment), ca site-ul live să afișeze ce schimbă clientul.</p>
                    </div>
                  )}
                  {portal.exists && portal.ready && !demoRunning && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" className="h-9" loading={busy === 'prepare'} onClick={() => { if (confirm('Claude verifică site-ul și adaugă secțiunile editabile care lipsesc (ex. camerele cu poze). Ce a pus clientul rămâne. Continui?')) prepareSite(true) }}>🧩 Actualizează secțiunile editabile</Button>
                      <span className="text-[11px] text-slate-500">ex. camere / spații cu mai multe poze, ca la Booking</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input className="flex-1 h-9 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-900" placeholder="Domeniul clientului (ex. hanulizvorulrece.ro)" value={liveUrl} onChange={e => setLiveUrl(e.target.value)} />
                    <Button size="sm" className="h-9" loading={busy === 'live'} disabled={!liveUrl.trim()} onClick={saveLive}>🌐 Pune pe domeniu</Button>
                  </div>
                  {(domainSetup || portal.domain_auto === false) && <details open={domainSetup} className="text-[12px] text-slate-700 rounded-md bg-white border border-slate-200 p-2"><summary className="cursor-pointer font-medium text-slate-800">🔑 Activează butonul „Pune pe domeniu” (o singură dată, pentru toți clienții)</summary><ol className="list-decimal pl-4 mt-1 space-y-1"><li>vercel.com → Account Settings → <b>Tokens</b> → Create → copiază tokenul.</li><li>dash.cloudflare.com → My Profile → <b>API Tokens</b> → Create Token → șablonul <b>„Edit zone DNS”</b>, Zone Resources: <b>All zones</b> → copiază tokenul.</li><li>Vercel → proiectul aplicației → Settings → Environment Variables: <b>VERCEL_TOKEN</b> și <b>CLOUDFLARE_API_TOKEN</b> → Redeploy.</li></ol><p className="mt-1 text-slate-500">După asta, pentru fiecare client: scrii domeniul și apeși butonul. Atât.</p></details>}
                  <Button size="sm" variant={portal.exists ? 'secondary' : 'primary'} className="h-9" loading={busy === 'portal'} disabled={demoRunning} onClick={activatePortal}>{portal.exists ? (portal.account ? '🔄 Cod nou (resetare parolă)' : '🔄 Cod nou pentru client') : '📱 Activează aplicația clientului'}</Button>
                </div>
              )}
              {['won', 'interested', 'call_meeting', 'proposal_sent', 'negotiation', 'replied'].includes(r.stage) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-2">
                  <div className="text-[12px] font-medium text-emerald-900">🚀 Site-ul final</div>
                  <a href={`/api/crm/leads/${r.id}/export`} download className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium bg-white border border-emerald-300 text-emerald-800">⬇️ Descarcă site-ul (.zip, doar dacă îl găzduiești în altă parte)</a>
                  <details className="text-[12px] text-slate-700">
                    <summary className="cursor-pointer text-emerald-900">Cum îl pun live (Cloudflare Pages, gratuit)</summary>
                    <ol className="list-decimal pl-5 mt-1 space-y-0.5">
                      <li>dash.cloudflare.com → <b>Workers & Pages</b> → Create → <b>Pages</b> → <b>Upload assets</b>.</li>
                      <li>Numele proiectului = numele firmei → urci fișierul .zip descărcat → Deploy. Site-ul apare la <i>nume.pages.dev</i>.</li>
                      <li><b>Custom domains</b> → adaugi domeniul clientului și urmezi pașii (domeniul trebuie să fie pe numele clientului).</li>
                      <li>Dacă are deja domeniu cu email (office@…), copiază înainte înregistrările <b>MX</b>, ca să nu-i oprești emailul.</li>
                      <li>După modificări: le aplici aici, descarci din nou .zip-ul și îl urci ca „new deployment” în același proiect.</li>
                    </ol>
                  </details>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {r.demo_style && <span>Stil: <b className="text-slate-700">{directionById(r.demo_style)?.name || r.demo_style}</b></span>}
                <select className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-700" value={style} onChange={e => setStyle(e.target.value)}>
                  <option value="auto">Stil nou automat</option>
                  {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button className="underline" disabled={busy === 'demo'} onClick={makeDemo}>↻ Refă demo-ul de la zero (același link)</button>
              </div>
            </div>
          ) : (
            <>
              {r.demo_status === 'error' && <p className="mb-2 text-xs text-rose-700">Demo-ul n-a reușit: {r.demo_error || 'eroare necunoscută'}. Încearcă din nou.</p>}
              <div className="flex items-center gap-2 mb-2 text-xs text-slate-600">
                <span>Stil:</span>
                <select className="h-8 flex-1 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-700" value={style} onChange={e => setStyle(e.target.value)}>
                  <option value="auto">Automat (potrivit meseriei, diferit de ultimele demo-uri)</option>
                  {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <Button variant="primary" className="w-full h-10" loading={busy === 'demo'} onClick={makeDemo}>🎨 Fă demo site pentru {r.name}</Button>
              <p className="text-[11px] text-slate-400 mt-1">Site concept în {LANG_RO[country]}, cu pozele și recenziile lui reale din Google{r.website_url && !['NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY'].includes(r.website_status) ? ' și textele de pe site-ul actual' : ''}. Se face pe server — nu trebuie să stai pe pagină.</p>
            </>
          )}
        </Step>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
        {!contacted
          ? <Button size="sm" variant="primary" loading={busy === 'sent'} onClick={() => sent(mobile && !noWa ? 'whatsapp' : r.email ? 'email' : 'phone')}>✅ Am trimis mesajul</Button>
          : r.stage !== 'interested'
            ? <Button size="sm" variant="primary" loading={busy === 'positive'} onClick={() => replied('positive')}>🙋 E interesat</Button>
            : <Button size="sm" loading={busy === 'won'} onClick={() => setStage('won', 'Felicitări! Marcat ca client câștigat.')}>🏆 A acceptat (client)</Button>}
        {waiting && <Button size="sm" variant="ghost" loading={busy === 'negative'} onClick={() => replied('negative')}>👎 A zis nu</Button>}
        {contacted && <Button size="sm" variant="ghost" loading={busy === 'new_lead'} onClick={() => setStage('new_lead', 'L-am pus înapoi în lista zilei.')}>↩ Înapoi în listă</Button>}
        <Button size="sm" variant="ghost" onClick={notFit}>Nu e potrivit</Button>
        <Link href={`/crm/leads/${r.id}`} className="h-8 px-2 inline-flex items-center text-[13px] text-slate-500">Detalii →</Link>
      </div>
      {infoMsg && <p className="text-xs text-teal-800 mt-2">{infoMsg}</p>}
      {err && <p className="text-xs text-rose-700 mt-2">{err}</p>}
      <button className="mt-2 w-full text-center text-xs text-slate-400" onClick={() => setOpen(false)}>▲ Închide</button>
      </>}
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
  googleCostMonth: number; stats: Stats
  state: { steps_today: number; last_auto_at?: string; log: string[] }
}

function HuntPanel({ country, googleKey, onProgress, onInfo }: { country: Country; googleKey: string; onProgress: () => void; onInfo: (i: HuntInfo) => void }) {
  const [info, setInfo] = useState<HuntInfo | null>(null)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const stop = useRef(false)
  const refresh = useCallback(async () => {
    try { const i = await api<HuntInfo>(`/api/crm/hunt?country=${country}`); setInfo(i); onInfo(i) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [country]) // eslint-disable-line react-hooks/exhaustive-deps
  async function setTarget(n: number) {
    try {
      const d = await api<{ settings: { target_market: Record<string, unknown> } }>('/api/crm/settings')
      await api('/api/crm/settings', { method: 'PUT', json: { key: 'target_market', value: { ...d.settings.target_market, daily_target: n } } })
      setInfo(x => x && { ...x, target: n })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
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
  async function cleanupDb() {
    try {
      const p = await api<{ keep: number; remove: number }>('/api/crm/cleanup')
      if (!p.remove) { alert(`Nimic de șters: toate cele ${p.keep} firme sunt contactate / clienți.`); return }
      if (!confirm(`Se șterg ${p.remove} firme necontactate (cu demo-urile lor netrimise).\nRămân ${p.keep}: contactate, interesate, clienți, plus cele marcate „nu e potrivit” / „fără WhatsApp”, ca să nu reapară.\n\nNu se poate anula. Continui?`)) return
      const r = await api<{ removed: number }>('/api/crm/cleanup', { json: { confirm: 'STERGE' } })
      alert(`Gata: am șters ${r.removed} firme. Baza de date e acum mult mai mică.`)
      location.reload()
    } catch (e) { alert(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <section className="bg-slate-900 text-white rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Lista zilei</div>
          <div className="text-3xl font-semibold tabular-nums">{info ? info.pool : '…'}<span className="text-slate-500 text-xl"> / {info?.target ?? 50}</span></div>
          <div className="text-[12px] text-slate-400">firme fără site / cu site de refăcut, cu mobil, necontactate</div>
          {info && !running && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">Țintă/zi:
              {[25, 50, 75, 100].map(n => <button key={n} onClick={() => setTarget(n)} className={cx('px-1.5 py-0.5 rounded', info.target === n ? 'bg-teal-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300')}>{n}</button>)}
            </div>
          )}
        </div>
        {running
          ? <Button className="h-11 w-full sm:w-auto" onClick={() => { stop.current = true }}>⏸ Oprește</Button>
          : <Button variant="primary" className="h-11 w-full sm:w-auto bg-teal-500 hover:bg-teal-400 text-slate-950" disabled={!info || info.pool >= info.target} onClick={run}>▶ Completează până la {info?.target ?? 50}</Button>}
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-teal-400 transition-all" style={{ width: `${pct}%` }} /></div>
      {(msg || running) && <p className="mt-2 text-sm text-teal-200 flex items-center gap-2">{running && <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />}{msg || 'Caut…'}</p>}
      {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
      {info?.stats && (
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {([['Trimise azi', info.stats.contacted_today], ['Contactați', info.stats.contacted], ['Au răspuns', info.stats.replied], ['Interesați', info.stats.interested + info.stats.won]] as [string, number][]).map(([l, n]) => (
            <div key={l} className="rounded-lg bg-slate-800 py-1.5"><div className="text-lg font-semibold tabular-nums">{n}</div><div className="text-[10px] text-slate-400 leading-tight">{l}</div></div>
          ))}
        </div>
      )}
      {info && (
        <div className="mt-3 text-[12px] text-slate-400 space-y-0.5">
          <div>Azi: {info.state.steps_today} căutări · {info.newToday} firme noi salvate</div>
          <div>💰 Google (estimat de aplicație, toate țările): azi <b className="text-slate-200">${info.googleCostToday.toFixed(2)}</b> · luna asta <b className="text-slate-200">${(info.googleCostMonth || 0).toFixed(2)}</b> · <a className="underline text-teal-300" href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">costul real în Google Cloud</a> · <a className="underline text-teal-300" href="https://console.cloud.google.com/apis/dashboard" target="_blank" rel="noreferrer">nr. de apeluri</a></div>
          <div><button className="underline text-amber-300" onClick={cleanupDb}>🧹 Curăță baza de date (rămân doar firmele contactate și clienții)</button></div>
          <div>{info.placesMode === 'legacy'
            ? <>API Google vechi (~$0.40 la 20 de firme). Activează „Places API (New)” în Google Cloud și costă de ~10 ori mai puțin — aplicația trece singură pe el.</>
            : info.placesMode === 'new' ? <>API Google nou (ieftin: un apel pentru 20 de firme).</> : <>Prima căutare verifică ce API Google e activ la cheia ta.</>}</div>
          <div>Automat în fiecare dimineață ({country === 'HU' ? '~8:10 ora Ungariei' : country === 'RO' ? '~8:50 ora României' : '~7:40 ora UK'}): {info.serverKey ? <>activ{info.state.last_auto_at ? ` · ultima rulare ${new Date(info.state.last_auto_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</> : <>pune <b>GOOGLE_PLACES_API_KEY</b> în Vercel (Settings → Environment Variables) ca să meargă singur.</>}</div>
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
