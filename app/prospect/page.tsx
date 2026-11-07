'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/storage'
import { CITY_COORDINATES, JUDETE, BUSINESS_CATEGORIES } from '@/lib/constants'
import { addRebuildLeads, getRebuildLeads, opportunityScore } from '@/lib/rebuild'
import type { RebuildLead } from '@/lib/rebuild'
import type { Settings } from '@/lib/types'
import { phoneType } from '@/lib/phone'
import { getProspects, saveProspects, updateProspect } from '@/lib/prospect'
import type { Prospect } from '@/lib/prospect'
import { seasonFor } from '@/lib/season'
import { categoryOptions, C, Pill, Btn, Bar, ago, LeadLinks, verdict, scoreColor, fieldStyle } from '@/components/rebuild-ui'

type Want = 'nosite' | 'site' | 'both'
type Filter = 'all' | 'nosite' | 'old' | 'wa_yes' | 'mobile_todo' | 'landline' | 'sent'

function matches(p: Prospect, f: Filter): boolean {
  switch (f) {
    case 'nosite':      return !!p.no_site && p.site_check?.status !== 'has_site'
    case 'old':         return !p.no_site && !!p.audit && p.audit.outdated_score >= 40
    case 'wa_yes':      return p.wa_status === 'yes'
    case 'mobile_todo': return p.phone_type === 'mobile' && p.wa_status === 'unknown'
    case 'landline':    return p.phone_type === 'landline'
    case 'sent':        return !!p.sent_to_rebuild
    default:            return true
  }
}

export default function ProspectPage() {
  const [list, setList] = useState<Prospect[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [mounted, setMounted] = useState(false)
  const [judet, setJudet] = useState('Maramureș')
  const [category, setCategory] = useState('lodging')
  const [minReviews, setMinReviews] = useState(10)
  const [onlyRecent, setOnlyRecent] = useState(true)
  const [want, setWant] = useState<Want>('both')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => { setList(getProspects()); setSettings(getSettings()); setMounted(true) }, [])

  const change = (id: string, u: Partial<Prospect>) => setList(updateProspect(id, u))

  // Caută oraș cu oraș în tot județul (câte o cerere per oraș, max 60 rezultate fiecare)
  async function searchCounty() {
    const cities = (JUDETE[judet] || []).filter(c => CITY_COORDINATES[c])
    if (!cities.length) { setErr('Județul nu are orașe cu coordonate în aplicație'); return }
    setErr(''); setBusy('search')
    let current = getProspects()
    let added = 0, closed = 0, stale = 0
    for (let i = 0; i < cities.length; i++) {
      setProgress(`${cities[i]} (${i + 1}/${cities.length})… ${added} noi până acum`)
      try {
        const res = await fetch('/api/find-sites', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: cities[i], category, minReviews, onlyRecent, includeNoSite: want !== 'site', pages: 3,
            skipIds: current.map(p => p.place_id), googleApiKey: settings?.googlePlacesApiKey }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        closed += data.closed || 0; stale += data.stale || 0
        const ids = new Set(current.map(p => p.place_id))
        const fresh: Prospect[] = (data.businesses as RebuildLead[])
          .filter(b => !ids.has(b.place_id) && (want === 'both' || (want === 'nosite') === !!b.no_site))
          .map(b => ({ ...b, phone_type: phoneType(b.phone_intl), wa_status: 'unknown' as const }))
        current = [...current, ...fresh]
        added += fresh.length
        saveProspects(current); setList(current)
      } catch (e) { setErr(`${cities[i]}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    setProgress(`Gata: ${added} afaceri noi din ${cities.length} orașe · ${closed} închise scoase${onlyRecent ? ` · ${stale} fără recenzii din ${new Date().getFullYear()} scoase` : ''}`)
    setBusy('')
  }

  async function checkDomains(p: Prospect) {
    const res = await fetch('/api/check-domains', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.name, city: p.city }) })
    const data = await res.json()
    change(p.place_id, { site_check: { status: data.found?.length ? 'possible' : 'none_found', found: data.found || [], checked_at: new Date().toISOString() } })
  }

  async function audit(p: Prospect) {
    const res = await fetch('/api/audit-site', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: p.website }) })
    const data = await res.json()
    if (res.ok) change(p.place_id, { audit: data.audit, stage: 'audited', contact_email: p.contact_email || data.audit.emails[0] || '' })
  }

  async function runBatch(kind: 'domains' | 'audit') {
    const todo = kind === 'domains'
      ? list.filter(p => p.no_site && !p.site_check).slice(0, 30)
      : list.filter(p => !p.no_site && !p.audit).slice(0, 25)
    setBusy(kind)
    for (let i = 0; i < todo.length; i++) {
      setProgress(`${kind === 'domains' ? 'Verific domenii' : 'Auditez site-uri'}: ${i + 1}/${todo.length} · ${todo[i].name}`)
      try { await (kind === 'domains' ? checkDomains(todo[i]) : audit(todo[i])) } catch {}
    }
    setProgress(''); setBusy('')
  }

  // Un site găsit pe un domeniu probabil: lead-ul devine „cu site”, de auditat pentru redesign
  function markHasSite(p: Prospect, url: string) {
    change(p.place_id, { no_site: false, website: url, audit: undefined, stage: 'found',
      site_check: { ...(p.site_check || { found: [], checked_at: new Date().toISOString() }), status: 'has_site' } })
  }

  function sendToRebuild(ps: Prospect[]) {
    const existing = new Set(getRebuildLeads().map(l => l.place_id))
    addRebuildLeads(ps.filter(p => !existing.has(p.place_id)).map(({ phone_type, wa_status, site_check, sent_to_rebuild, ...lead }) => ({
      ...lead,
      notes: [lead.notes, wa_status === 'yes' ? 'WhatsApp verificat ✅' : wa_status === 'no' ? 'Nu are WhatsApp ❌ — sună sau email' : phone_type === 'landline' ? 'Telefon fix — fără WhatsApp' : ''].filter(Boolean).join('\n'),
    })))
    let next = getProspects()
    for (const p of ps) next = next.map(x => x.place_id === p.place_id ? { ...x, sent_to_rebuild: true } : x)
    saveProspects(next); setList(next)
  }

  const sorted = useMemo(() => [...list].sort((a, b) => opportunityScore(b) - opportunityScore(a)), [list])
  const shown = sorted.filter(p => matches(p, filter))
  const count = (f: Filter) => list.filter(p => matches(p, f)).length
  // validate = au un canal de contact sigur și site-ul verificat (indiferent de filtrul afișat)
  const ready = list.filter(p => !p.sent_to_rebuild && (p.wa_status === 'yes' || p.phone_type === 'landline' || p.contact_email)
    && (p.no_site ? p.site_check?.status === 'confirmed_none' || p.site_check?.status === 'none_found' : !!p.audit))

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)' }}>
      <header className="border-b border-slate-800/50 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white text-sm">← Acasă</Link>
            <span className="text-slate-700">/</span>
            <span className="font-bold text-white">🧭 Prospectare</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/rebuild" className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60">🔁 Rebuild</Link>
            <Link href="/settings" className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60">Setări</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6" style={{ display: 'grid', gap: 16 }}>
        <div className="glass" style={{ borderRadius: 20, padding: 16, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
          <b style={{ color: '#f1f5f9' }}>Validezi întâi, faci site doar după.</b> Cauți în tot județul, apoi la fiecare afacere verifici:
          (1) <b>📱 mobil sau ☎️ fix</b>: pe fix nu există WhatsApp, deci suni; (2) <b>WhatsApp</b>: apeși „Verifică”, se deschide chatul și vezi imediat dacă numărul există, apoi marchezi ✅ sau ❌;
          (3) <b>site</b>: la cei fără site verifici pe Google și pe domeniile probabile, iar la cei cu site rulezi auditul. Doar afacerile validate le trimiți în Rebuild.
        </div>

        {/* Căutare pe județ */}
        <div className="glass" style={{ borderRadius: 20, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <select value={judet} onChange={e => setJudet(e.target.value)} style={fieldStyle()}>
              {Object.keys(JUDETE).sort().map(j => <option key={j} value={j}>{j} ({(JUDETE[j] || []).filter(c => CITY_COORDINATES[c]).length} orașe)</option>)}
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)} style={fieldStyle()}>
              {(mounted ? categoryOptions() : Object.entries(BUSINESS_CATEGORIES)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={minReviews} onChange={e => setMinReviews(Number(e.target.value))} style={fieldStyle()}>
              {[5, 10, 20, 40, 80].map(n => <option key={n} value={n}>Min. {n} recenzii</option>)}
            </select>
            <select value={want} onChange={e => setWant(e.target.value as Want)} style={fieldStyle()}>
              <option value="both">Cu și fără site</option>
              <option value="nosite">Doar fără site</option>
              <option value="site">Doar cu site (redesign)</option>
            </select>
            <Btn solid onClick={searchCounty} disabled={!!busy}>{busy === 'search' ? '⏳ Caut…' : `🔍 Caută în tot județul`}</Btn>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyRecent} onChange={() => setOnlyRecent(v => !v)} style={{ accentColor: C.amber }} />
            Doar afaceri active, cu recenzii din {new Date().getFullYear()} (cele închise sunt scoase mereu)
          </label>
          <div style={{ fontSize: 11, color: C.dim }}>Până la 60 de rezultate per oraș. Fiecare afacere cu destule recenzii costă o cerere de detalii la Google, așa că un județ întreg costă mai mult decât o căutare obișnuită.</div>
          {progress && <div style={{ fontSize: 12, color: C.muted }}>{progress}</div>}
          {err && <div style={{ fontSize: 13, color: C.red }}>⚠️ {err}</div>}
        </div>

        {/* Filtre + acțiuni în lot */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['all', 'Toate'], ['nosite', '🚫 Fără site'], ['old', '🎯 Site vechi'], ['wa_yes', '✅ Are WhatsApp'], ['mobile_todo', '📱 Mobil neverificat'], ['landline', '☎️ Fix'], ['sent', '➡️ Trimise']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 0,
                background: filter === k ? '#3b82f6' : 'rgba(30,41,59,.6)', color: filter === k ? '#fff' : C.muted }}>
              {l} ({count(k)})
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small onClick={() => runBatch('domains')} disabled={!!busy || !list.some(p => p.no_site && !p.site_check)}>🌐 Verifică domenii (fără site, max 30)</Btn>
          <Btn small onClick={() => runBatch('audit')} disabled={!!busy || !list.some(p => !p.no_site && !p.audit)}>🩺 Auditează site-uri (max 25)</Btn>
          <Btn small solid color={C.green} onClick={() => sendToRebuild(ready)} disabled={!ready.length}>➡️ Trimite validatele în Rebuild ({ready.length})</Btn>
          {list.length > 0 && <Btn small color={C.red} onClick={() => { if (confirm('Ștergi toată lista de prospectare?')) { saveProspects([]); setList([]) } }}>🗑 Golește lista</Btn>}
        </div>

        {/* Listă */}
        {shown.length === 0 ? (
          <div className="glass" style={{ borderRadius: 20, padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
            {list.length ? 'Nimic în acest filtru.' : 'Alege județul și categoria, apoi „Caută în tot județul”.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {shown.map(p => {
              const q = encodeURIComponent(`"${p.name}" ${p.city.replace(' 🏘️', '')}`)
              return (
                <div key={p.place_id} className="glass" style={{ borderRadius: 16, padding: 14, display: 'grid', gap: 8, opacity: p.sent_to_rebuild ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 15 }}>{p.name}</span>
                    <Pill color={C.amber}>🎯 {opportunityScore(p)}</Pill>
                    {seasonFor(p.category) && <Pill color={C.red}>🔥 În sezon</Pill>}
                    {p.sent_to_rebuild && <Pill color={C.green}>➡️ În Rebuild</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {p.category_label} · {p.city.replace(' 🏘️', '')} · <span style={{ color: '#f59e0b' }}>★ {p.rating.toFixed(1)}</span> ({p.reviews_count})
                    {p.last_review_at && <span style={{ color: C.green }}> · 💬 ultima recenzie {ago(p.last_review_at)}</span>}
                    {p.address && <> · {p.address}</>}
                  </div>
                  <LeadLinks l={p} />

                  {/* Telefon & WhatsApp */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{p.phone || '—'}</span>
                    {p.phone_type === 'landline' && <Pill color={C.dim}>☎️ Fix: fără WhatsApp, sună</Pill>}
                    {p.phone_type === 'mobile' && <Pill color={C.blue}>📱 Mobil</Pill>}
                    {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`}><Btn small>📞 Sună</Btn></a>}
                    {p.phone_type !== 'landline' && p.phone_intl && (<>
                      <a href={`https://wa.me/${p.phone_intl}`} target="_blank" rel="noreferrer"><Btn small color={C.wa}>💬 Verifică WhatsApp</Btn></a>
                      <Btn small color={C.green} solid={p.wa_status === 'yes'} onClick={() => change(p.place_id, { wa_status: 'yes' })}>✅ Are</Btn>
                      <Btn small color={C.red} solid={p.wa_status === 'no'} onClick={() => change(p.place_id, { wa_status: 'no' })}>❌ Nu are</Btn>
                    </>)}
                  </div>

                  {/* Site */}
                  {p.no_site ? (
                    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Pill color={C.red}>🚫 Fără site în Google Maps</Pill>
                        <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer"><Btn small>🔎 Caută pe Google</Btn></a>
                        <Btn small onClick={() => checkDomains(p)} disabled={!!busy}>🌐 Verifică domenii</Btn>
                        <Btn small color={C.green} solid={p.site_check?.status === 'confirmed_none'}
                          onClick={() => change(p.place_id, { site_check: { found: p.site_check?.found || [], checked_at: new Date().toISOString(), status: 'confirmed_none' } })}>✔ Confirm: nu are site</Btn>
                      </div>
                      {p.site_check?.status === 'none_found' && <div style={{ fontSize: 12, color: C.green }}>Niciun site găsit pe domeniile probabile. Uită-te și pe Google, apoi confirmă.</div>}
                      {p.site_check?.status === 'possible' && (
                        <div style={{ fontSize: 12, color: C.amber, display: 'grid', gap: 4 }}>
                          ⚠️ Posibil are site:
                          {p.site_check.found.map(f => (
                            <div key={f.url} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{f.url}</a> <span style={{ color: C.dim }}>{f.title}</span>
                              <Btn small onClick={() => markHasSite(p, f.url)}>E site-ul lor → redesign</Btn>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <a href={p.website} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 40)}</a>
                        {!p.audit && <Btn small onClick={() => audit(p)} disabled={!!busy}>🩺 Auditează</Btn>}
                      </div>
                      {p.audit && (
                        <>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: C.dim, maxWidth: 360 }}>
                            <span style={{ width: 70 }}>Site vechi</span><Bar value={p.audit.outdated_score} color={scoreColor(p.audit.outdated_score)} /><span>{p.audit.outdated_score}</span>
                          </div>
                          {p.audit.issues.length > 0 && <div style={{ fontSize: 12, color: '#cbd5e1' }}>{p.audit.issues.slice(0, 3).join(' · ')}</div>}
                          <div style={{ fontSize: 12, color: C.muted }}>{verdict(p.audit.outdated_score, p.revenue_score)}</div>
                        </>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!p.sent_to_rebuild && <Btn small solid onClick={() => sendToRebuild([p])}>➡️ Trimite în Rebuild</Btn>}
                    <Btn small color={C.dim} onClick={() => { const next = getProspects().filter(x => x.place_id !== p.place_id); saveProspects(next); setList(next) }}>🗑</Btn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
