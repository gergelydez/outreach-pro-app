'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/storage'
import { CITY_COORDINATES, BUSINESS_CATEGORIES } from '@/lib/constants'
import {
  getRebuildLeads, addRebuildLeads, updateRebuildLead, deleteRebuildLead,
  getContactsToday, logContact, opportunityScore, STAGE_INFO,
} from '@/lib/rebuild'
import type { RebuildLead, RebuildStage, SiteAudit } from '@/lib/rebuild'
import type { Settings } from '@/lib/types'
import { slugify, withConceptBanner } from '@/lib/preview'

const CITIES = Object.keys(CITY_COORDINATES).sort()

// Categorii unde un site bun aduce bani și clientul își permite să plătească
const PRIORITY = ['dentist', 'lawyer', 'doctor', 'physiotherapist', 'veterinary_care', 'accounting',
  'real_estate_agency', 'lodging', 'car_dealer', 'car_repair', 'auto_body', 'restaurant', 'spa', 'gym', 'beauty_salon']
const CATEGORIES = [
  ...PRIORITY.filter(k => BUSINESS_CATEGORIES[k]).map(k => [k, `💰 ${BUSINESS_CATEGORIES[k]}`] as const),
  ...Object.entries(BUSINESS_CATEGORIES).filter(([k]) => !PRIORITY.includes(k)),
]

const C = { bg: 'rgba(15,22,41,0.8)', border: 'rgba(99,179,237,0.15)', muted: '#94a3b8', dim: '#64748b',
  wa: '#25D366', blue: '#63b3ed', amber: '#f6ad55', violet: '#a78bfa', red: '#fc8181', green: '#4ade80', cyan: '#22d3ee' }

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20,
    fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>{children}</span>
}

function Btn({ onClick, children, color = C.blue, disabled = false, solid = false, small = false, title }:
  { onClick?: () => void; children: React.ReactNode; color?: string; disabled?: boolean; solid?: boolean; small?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ padding: small ? '6px 10px' : '9px 14px', borderRadius: 10, fontSize: small ? 12 : 13, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'all .15s',
        background: solid ? color : `${color}18`, color: solid ? '#0a0f1e' : color, border: `1px solid ${color}55` }}>
      {children}
    </button>
  )
}

function Bar({ value, color }: { value: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden', flex: 1 }}>
    <div style={{ width: `${value}%`, height: '100%', background: color }} /></div>
}

function scoreColor(v: number) { return v >= 70 ? C.red : v >= 45 ? C.amber : v >= 25 ? '#eab308' : C.dim }

function fieldStyle(): React.CSSProperties {
  return { width: '100%', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#f1f5f9',
    background: C.bg, border: `1px solid ${C.border}`, outline: 'none' }
}

// Mesaj de rezervă fără AI — același ton: scurt, personal, fără presiune
function templateMessage(l: RebuildLead, s: Settings, channel: 'whatsapp' | 'email'): { subject: string; message: string } {
  const issue = l.audit?.issues.find(i => /telefon|mobil/i.test(i)) ? 'pe telefon e destul de greu de folosit'
    : l.audit?.issues.find(i => /HTTPS|Nesigur/i.test(i)) ? 'browserul îl marchează ca „Nesigur”'
    : l.audit?.issues.length ? 'arată puțin învechit față de cât de bine lucrați' : ''
  const me = s.senderName || '[numele tău]'
  const link = l.preview_url || '[LINK PREVIEW]'
  const body = [
    `Bună ziua! Sunt ${me}, web designer${l.city ? ` din zonă` : ''}.`,
    `Am dat peste site-ul ${l.name}${issue ? ` și am observat că ${issue}` : ''}, așa că am făcut un concept modern, ca să vedeți cum ar putea arăta:`,
    link,
    `Fără nicio obligație, m-am gândit că v-ar plăcea să-l vedeți. Dacă nu vă interesează, îmi spuneți și nu vă mai deranjez.`,
    channel === 'email' ? `\nO zi bună,\n${me}${s.yourPhone ? `\n${s.yourPhone}` : ''}${s.yourWebsite ? `\n${s.yourWebsite}` : ''}` : '',
  ].filter(Boolean).join(channel === 'email' ? '\n\n' : '\n')
  return { subject: `Un concept nou pentru site-ul ${l.name}`, message: body.trim() }
}

// ─── Workspace pentru un singur lead ──────────────────────────────────────────
function Workspace({ lead, settings, onChange, onClose }:
  { lead: RebuildLead; settings: Settings; onChange: (u: Partial<RebuildLead>) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'audit' | 'demo' | 'message' | 'follow'>(
    lead.stage === 'contacted' || lead.stage === 'replied' ? 'follow'
      : lead.preview_url ? 'message' : lead.audit ? 'demo' : 'audit')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState(0)
  const [extra, setExtra] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [noBlob, setNoBlob] = useState(false)
  const [channel, setChannel] = useState<'whatsapp' | 'email'>(lead.phone_intl ? 'whatsapp' : 'email')
  const [copied, setCopied] = useState('')
  const limit = Number(settings.dailyOutreachLimit) || 10
  const contactsToday = getContactsToday()

  async function runAudit() {
    setBusy('audit'); setErr('')
    try {
      const res = await fetch('/api/audit-site', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: lead.website }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const audit: SiteAudit = data.audit
      onChange({ audit, contact_email: lead.contact_email || audit.emails[0] || '',
        stage: lead.stage === 'found' ? 'audited' : lead.stage })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  async function generateDemo() {
    setBusy('demo'); setErr(''); setProgress(0)
    try {
      const res = await fetch('/api/generate-redesign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: { ...lead, demo_html: '' }, anthropicApiKey: settings.anthropicApiKey, extraInstructions: extra }) })
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`) }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let html = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line)
          if (ev.t === 'progress') setProgress(ev.chars)
          if (ev.t === 'error') throw new Error(ev.error)
          if (ev.t === 'done') html = ev.html
        }
      }
      if (!html) throw new Error('Generarea s-a oprit fără rezultat (timeout?) — încearcă din nou')
      onChange({ demo_html: html, stage: ['found', 'audited', 'shortlisted'].includes(lead.stage) ? 'demo_ready' : lead.stage })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  async function publish() {
    setBusy('publish'); setErr(''); setNoBlob(false)
    try {
      const res = await fetch('/api/publish-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: lead.demo_html, businessName: lead.name, designer: settings.senderName, existingUrl: lead.preview_url }) })
      const data = await res.json()
      if (data.code === 'no_blob') { setNoBlob(true); setBusy(''); return }
      if (!res.ok) throw new Error(data.error)
      onChange({ preview_url: data.url, stage: ['contacted', 'replied', 'won'].includes(lead.stage) ? lead.stage : 'published' })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  function download() {
    const blob = new Blob([withConceptBanner(lead.demo_html, lead.name, settings.senderName)], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slugify(lead.name)}.html`
    a.click()
  }

  async function aiMessage() {
    setBusy('msg'); setErr('')
    try {
      const res = await fetch('/api/rebuild-message', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: { ...lead, demo_html: '' }, channel, anthropicApiKey: settings.anthropicApiKey,
          senderName: settings.senderName, yourPhone: settings.yourPhone, yourWebsite: settings.yourWebsite }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onChange({ message: data.message, email_subject: data.subject || lead.email_subject })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }

  function useTemplate() {
    const t = templateMessage(lead, settings, channel)
    onChange({ message: t.message, email_subject: t.subject })
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopied(key); setTimeout(() => setCopied(''), 1800)
  }

  function markContacted(ch: RebuildLead['contact_channel']) {
    logContact()
    onChange({ stage: 'contacted', contact_channel: ch, contacted_at: new Date().toISOString() })
    setTab('follow')
  }

  const a = lead.audit
  const msgReady = !!lead.message && !lead.message.includes('[LINK PREVIEW]')
  const overLimit = contactsToday >= limit

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: tab === 'demo' ? 1100 : 760, borderRadius: 24, padding: 22 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{lead.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {lead.category_label} · {lead.city.replace(' 🏘️', '')} · ★ {lead.rating.toFixed(1)} ({lead.reviews_count}) ·{' '}
              <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{lead.website.replace(/^https?:\/\//, '').slice(0, 40)}</a>
            </div>
          </div>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 22, background: 'none', border: 0, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {([['audit', '1 · Audit'], ['demo', '2 · Redesign'], ['message', '3 · Mesaj'], ['follow', '4 · Urmărire']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: tab === k ? 'linear-gradient(135deg,#63b3ed,#3b82f6)' : 'rgba(30,41,59,.6)',
                color: tab === k ? '#fff' : C.muted, border: 0 }}>{l}</button>
          ))}
        </div>

        {err && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red, padding: 10, borderRadius: 10, fontSize: 13, marginBottom: 12 }}>⚠️ {err}</div>}

        {/* ── 1. AUDIT ── */}
        {tab === 'audit' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {!a ? (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ color: C.muted, fontSize: 14, marginBottom: 14 }}>Analizez site-ul actual: mobil, HTTPS, vechime, tehnologie, plus textele și emailul lor.</div>
                <Btn solid onClick={runAudit} disabled={busy === 'audit'}>{busy === 'audit' ? '⏳ Analizez…' : '🩺 Auditează site-ul'}</Btn>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[
                    ['Site vechi', a.outdated_score, scoreColor(a.outdated_score)],
                    ['Afacere care plătește', lead.revenue_score, C.green],
                    ['Oportunitate', lead.opportunity_score, C.amber],
                  ].map(([l, v, c]) => (
                    <div key={l as string} style={{ background: 'rgba(30,41,59,.5)', borderRadius: 14, padding: 12 }}>
                      <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>{l}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: c as string }}>{v as number}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>Probleme găsite</div>
                  {a.issues.length ? a.issues.map(i => <div key={i} style={{ fontSize: 13, color: '#cbd5e1', padding: '3px 0' }}>• {i}</div>)
                    : <div style={{ fontSize: 13, color: C.green }}>Site-ul pare în regulă tehnic. Probabil nu e o țintă bună — dacă arată totuși vechi, decide tu vizual.</div>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, display: 'grid', gap: 4 }}>
                  <div><b style={{ color: '#cbd5e1' }}>Titlu:</b> {a.title || '—'}</div>
                  <div><b style={{ color: '#cbd5e1' }}>Telefoane:</b> {a.phones.join(', ') || lead.phone || '—'}</div>
                  <div><b style={{ color: '#cbd5e1' }}>Social:</b> {a.socials.map(s => <a key={s} href={s} target="_blank" rel="noreferrer" style={{ color: C.blue, marginRight: 8 }}>{s.replace(/^https?:\/\/(www\.)?/, '')}</a>)}{!a.socials.length && '—'}</div>
                  <div><b style={{ color: '#cbd5e1' }}>Conținut extras:</b> {a.headings.length} titluri, {a.text_excerpt.length} caractere, {a.images.length} imagini</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>Email de contact {a.emails.length > 1 && <span style={{ color: C.dim }}>(găsite: {a.emails.join(', ')})</span>}</label>
                  <input value={lead.contact_email} onChange={e => onChange({ contact_email: e.target.value })} placeholder="nu am găsit — caută pe pagina de contact / Facebook" style={{ ...fieldStyle(), marginTop: 4 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={a.final_url} target="_blank" rel="noreferrer"><Btn>🌐 Deschide site-ul actual</Btn></a>
                  <Btn onClick={runAudit} disabled={!!busy}>{busy === 'audit' ? '⏳…' : '↻ Re-audit'}</Btn>
                  {!['shortlisted', 'demo_ready', 'published', 'contacted', 'replied', 'won'].includes(lead.stage) &&
                    <Btn solid color={C.amber} onClick={() => { onChange({ stage: 'shortlisted' }); setTab('demo') }}>⭐ E o țintă bună → Redesign</Btn>}
                  <Btn color={C.dim} onClick={() => { onChange({ stage: 'skipped' }); onClose() }}>⏭️ Nu e potrivit</Btn>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 2. REDESIGN ── */}
        {tab === 'demo' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!a && <div style={{ color: C.amber, fontSize: 13 }}>Fă întâi auditul — redesign-ul folosește conținutul real de pe site-ul lor.</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2}
                placeholder="Opțional: indicații de design (ex. „culori calde, accent pe programări online”, „păstrează logo-ul albastru”)"
                style={{ ...fieldStyle(), flex: 1, minWidth: 240, resize: 'vertical' }} />
              <Btn solid color={C.violet} onClick={generateDemo} disabled={!a || !!busy}>
                {busy === 'demo' ? `⏳ Construiesc… ${progress ? Math.round(progress / 1000) + 'k car.' : ''}` : lead.demo_html ? '↻ Regenerează' : '🎨 Generează redesign'}
              </Btn>
            </div>
            {busy === 'demo' && <div style={{ fontSize: 12, color: C.muted }}>Durează 1–4 minute. Nu închide fereastra.</div>}

            {lead.demo_html && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn small color={device === 'desktop' ? C.blue : C.dim} onClick={() => setDevice('desktop')}>🖥️ Desktop</Btn>
                  <Btn small color={device === 'mobile' ? C.blue : C.dim} onClick={() => setDevice('mobile')}>📱 Mobil</Btn>
                  <span style={{ flex: 1 }} />
                  <Btn small onClick={download}>⬇️ Descarcă HTML</Btn>
                  <Btn small solid color={C.cyan} onClick={publish} disabled={!!busy}>
                    {busy === 'publish' ? '⏳…' : lead.preview_url ? '↻ Actualizează preview-ul live' : '🔗 Publică preview live'}
                  </Btn>
                </div>
                <div style={{ background: '#0b1220', borderRadius: 14, padding: 8, display: 'flex', justifyContent: 'center' }}>
                  <iframe srcDoc={lead.demo_html} sandbox="allow-scripts allow-forms allow-popups" title="preview"
                    style={{ width: device === 'mobile' ? 390 : '100%', height: 640, border: 0, borderRadius: 10, background: '#fff' }} />
                </div>
              </>
            )}

            {lead.preview_url && (
              <div style={{ background: `${C.cyan}12`, border: `1px solid ${C.cyan}44`, borderRadius: 12, padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: C.cyan, fontWeight: 700 }}>🔗 Live:</span>
                <a href={lead.preview_url} target="_blank" rel="noreferrer" style={{ color: '#e2e8f0', fontSize: 13, wordBreak: 'break-all', flex: 1 }}>{lead.preview_url}</a>
                <Btn small onClick={() => copy(lead.preview_url, 'url')}>{copied === 'url' ? '✓ Copiat' : '📋 Copiază'}</Btn>
                <Btn small solid color={C.wa} onClick={() => setTab('message')}>Mai departe → Mesaj</Btn>
              </div>
            )}

            {noBlob && (
              <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 12, padding: 14, fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>
                <b style={{ color: C.amber }}>Hostingul de preview nu e activat încă.</b> Două variante:<br />
                <b>A (recomandat, o singură dată):</b> Vercel → proiectul tău → <i>Storage</i> → <i>Create → Blob</i> → <i>Connect to project</i>, apoi Redeploy. De atunci, butonul publică direct un link pe domeniul tău.<br />
                <b>B (acum, 30 secunde):</b> apasă <i>⬇️ Descarcă HTML</i>, deschide <a href="https://app.netlify.com/drop" target="_blank" rel="noreferrer" style={{ color: C.blue }}>app.netlify.com/drop</a>, trage fișierul acolo și primești un link live. Lipește-l aici:
                <input placeholder="https://…netlify.app" onBlur={e => e.target.value && onChange({ preview_url: e.target.value.trim(), stage: 'published' })} style={{ ...fieldStyle(), marginTop: 8 }} />
              </div>
            )}
          </div>
        )}

        {/* ── 3. MESAJ ── */}
        {tab === 'message' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!lead.preview_url && <div style={{ color: C.amber, fontSize: 13 }}>⚠️ Încă nu ai link de preview — mesajul se bazează pe el. Publică-l în pasul 2.</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn color={channel === 'whatsapp' ? C.wa : C.dim} onClick={() => setChannel('whatsapp')}>📱 WhatsApp</Btn>
              <Btn color={channel === 'email' ? C.blue : C.dim} onClick={() => setChannel('email')}>✉️ Email / formular</Btn>
              <span style={{ flex: 1 }} />
              <Btn onClick={useTemplate}>📝 Șablon</Btn>
              <Btn solid onClick={aiMessage} disabled={!!busy}>{busy === 'msg' ? '⏳…' : '🤖 Personalizează cu AI'}</Btn>
            </div>
            {channel === 'email' && (
              <input value={lead.email_subject} onChange={e => onChange({ email_subject: e.target.value })} placeholder="Subiect" style={fieldStyle()} />
            )}
            <textarea value={lead.message} onChange={e => onChange({ message: e.target.value })} rows={8}
              placeholder="Apasă „Șablon” sau „Personalizează cu AI”, apoi citește și ajustează — trebuie să sune a tine."
              style={{ ...fieldStyle(), resize: 'vertical', lineHeight: 1.55 }} />

            <div style={{ fontSize: 12, color: overLimit ? C.red : C.muted }}>
              Azi: {contactsToday}/{limit} contactări{overLimit ? ' — ai atins limita zilnică. Trimiterile manuale, puține și personale, primesc răspunsuri și nu-ți blochează contul.' : '.'}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={() => copy(channel === 'email' ? `${lead.email_subject}\n\n${lead.message}` : lead.message, 'msg')} disabled={!lead.message}>
                {copied === 'msg' ? '✓ Copiat' : '📋 Copiază'}</Btn>
              {channel === 'whatsapp' && lead.phone_intl && (
                <a href={msgReady ? `https://wa.me/${lead.phone_intl}?text=${encodeURIComponent(lead.message)}` : undefined} target="_blank" rel="noreferrer">
                  <Btn solid color={C.wa} disabled={!msgReady}>📱 Deschide WhatsApp</Btn></a>
              )}
              {channel === 'email' && lead.contact_email && (
                <a href={msgReady ? `mailto:${lead.contact_email}?subject=${encodeURIComponent(lead.email_subject)}&body=${encodeURIComponent(lead.message)}` : undefined}>
                  <Btn solid color={C.blue} disabled={!msgReady}>✉️ Deschide în email ({lead.contact_email})</Btn></a>
              )}
              {channel === 'email' && (
                <a href={lead.audit?.final_url || lead.website} target="_blank" rel="noreferrer"><Btn>🧾 Formularul lor de contact</Btn></a>
              )}
            </div>
            {channel === 'whatsapp' && !lead.phone_intl && <div style={{ fontSize: 12, color: C.amber }}>Nu am număr de telefon valid pentru WhatsApp — folosește email-ul sau sună.</div>}
            {channel === 'email' && !lead.contact_email && <div style={{ fontSize: 12, color: C.amber }}>Nu am găsit email — copiază mesajul și trimite-l prin formularul de pe site-ul lor sau pe Facebook.</div>}

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.muted }}>După ce ai trimis:</span>
              <Btn small solid color={C.green} onClick={() => markContacted(channel === 'email' ? 'email' : 'whatsapp')} disabled={!lead.message}>✓ Am trimis</Btn>
              <Btn small onClick={() => markContacted('form')} disabled={!lead.message}>✓ Trimis prin formular</Btn>
              <Btn small onClick={() => markContacted('phone')}>✓ Am sunat</Btn>
            </div>
          </div>
        )}

        {/* ── 4. URMĂRIRE ── */}
        {tab === 'follow' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {lead.contacted_at && <div style={{ fontSize: 13, color: C.muted }}>Contactat pe {new Date(lead.contacted_at).toLocaleString('ro-RO')} ({lead.contact_channel}).
              {Date.now() - new Date(lead.contacted_at).getTime() > 3 * 864e5 && lead.stage === 'contacted' &&
                <span style={{ color: C.amber }}> Au trecut 3+ zile — un singur follow-up scurt e ok („ați apucat să vă uitați?”). După aceea, lasă-i în pace.</span>}
            </div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['contacted', 'replied', 'won', 'lost'] as RebuildStage[]).map(s => (
                <Btn key={s} color={STAGE_INFO[s].color} solid={lead.stage === s} onClick={() => onChange({ stage: s })}>
                  {STAGE_INFO[s].emoji} {STAGE_INFO[s].label}</Btn>
              ))}
            </div>
            <textarea value={lead.notes} onChange={e => onChange({ notes: e.target.value })} rows={6}
              placeholder="Notițe: ce au răspuns, ce vor, buget, când revii…" style={{ ...fieldStyle(), resize: 'vertical' }} />
            {lead.stage === 'replied' && (
              <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}33`, borderRadius: 12, padding: 12, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                <b style={{ color: C.green }}>Au răspuns — următorii pași:</b> propune un apel de 10 minute; întreabă ce nu le place la site-ul actual și ce vor să obțină (programări, telefoane, clienți noi);
                trimite o ofertă fixă, scrisă ({settings.priceFrom}–{settings.priceTo} RON, {settings.deliveryDays} zile), cu avans de 50%. Concept-ul e deja făcut, deci livrarea e rapidă.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pagina ───────────────────────────────────────────────────────────────────
type Filter = 'all' | 'todo' | 'good' | 'pipeline' | 'contacted' | 'won' | 'skipped'

function matchesFilter(l: RebuildLead, f: Filter): boolean {
  switch (f) {
    case 'todo':      return !l.audit && l.stage === 'found'
    case 'good':      return !!l.audit && l.audit.outdated_score >= 35 && ['audited', 'found'].includes(l.stage)
    case 'pipeline':  return ['shortlisted', 'demo_ready', 'published'].includes(l.stage)
    case 'contacted': return ['contacted', 'replied'].includes(l.stage)
    case 'won':       return l.stage === 'won'
    case 'skipped':   return ['skipped', 'lost'].includes(l.stage)
    default:          return !['skipped', 'lost'].includes(l.stage)
  }
}

export default function RebuildPage() {
  const [leads, setLeads] = useState<RebuildLead[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [city, setCity] = useState('Cluj-Napoca')
  const [category, setCategory] = useState('dentist')
  const [minReviews, setMinReviews] = useState(20)
  const [searching, setSearching] = useState(false)
  const [auditing, setAuditing] = useState<string>('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  useEffect(() => {
    setLeads(getRebuildLeads())
    setSettings(getSettings())
    try { setShowGuide(localStorage.getItem('rebuild_hide_guide') !== '1') } catch {}
  }, [])

  function change(id: string, u: Partial<RebuildLead>) { setLeads(updateRebuildLead(id, u)) }

  async function search() {
    setSearching(true); setErr(''); setInfo('')
    try {
      const res = await fetch('/api/find-sites', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, category, minReviews, googleApiKey: settings?.googlePlacesApiKey }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const before = getRebuildLeads().length
      const merged = addRebuildLeads(data.businesses)
      setLeads(merged)
      setInfo(`${data.scanned} afaceri scanate · ${data.belowMinReviews} sub ${minReviews} recenzii · ${data.withoutSite} fără site propriu · ${merged.length - before} noi adăugate`)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setSearching(false)
  }

  // Audit secvențial, plafonat — e doar citirea site-urilor lor publice
  async function auditBatch() {
    const todo = leads.filter(l => !l.audit && l.stage === 'found').slice(0, 15)
    for (const l of todo) {
      setAuditing(l.place_id)
      try {
        const res = await fetch('/api/audit-site', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: l.website }) })
        const data = await res.json()
        if (res.ok) setLeads(updateRebuildLead(l.place_id, { audit: data.audit, stage: 'audited', contact_email: data.audit.emails[0] || '' }))
      } catch {}
    }
    setAuditing('')
  }

  const sorted = useMemo(() => [...leads].sort((a, b) =>
    (b.opportunity_score || opportunityScore(b)) - (a.opportunity_score || opportunityScore(a))), [leads])

  const filtered = sorted.filter(l => matchesFilter(l, filter))
  const count = (f: Filter) => sorted.filter(l => matchesFilter(l, f)).length

  const open = leads.find(l => l.place_id === openId)
  const limit = Number(settings?.dailyOutreachLimit) || 10
  const missingKeys = settings && (!settings.googlePlacesApiKey || !settings.anthropicApiKey)

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)' }}>
      <header className="border-b border-slate-800/50 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white text-sm">← Acasă</Link>
            <span className="text-slate-700">/</span>
            <span className="font-bold text-white">🔁 Rebuild Their Site</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Pill color={getContactsToday() >= limit ? C.red : C.wa}>📤 Azi: {settings ? getContactsToday() : 0}/{limit}</Pill>
            <Link href="/leads" className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60">Fără site</Link>
            <Link href="/settings" className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60">Setări</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6" style={{ display: 'grid', gap: 16 }}>
        {missingKeys && (
          <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 14, padding: 12, fontSize: 13, color: '#e2e8f0' }}>
            ⚙️ Lipsesc chei API în <Link href="/settings" style={{ color: C.amber, fontWeight: 700 }}>Setări</Link> (Google Places pentru căutare, Anthropic pentru redesign). Dacă sunt setate pe server (Vercel env), ignoră mesajul.
          </div>
        )}

        {showGuide && (
          <div className="glass" style={{ borderRadius: 20, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 16 }}>Cum funcționează: oferi valoare înainte să ceri ceva</div>
              <button onClick={() => { setShowGuide(false); try { localStorage.setItem('rebuild_hide_guide', '1') } catch {} }}
                style={{ color: C.dim, background: 'none', border: 0, cursor: 'pointer', fontSize: 12 }}>ascunde</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 12 }}>
              {[
                ['🔍', 'Listă mică, țintită', 'O nișă, un oraș, doar afaceri cu multe recenzii (= au clienți și bani).'],
                ['🩺', 'Alegi 2–3 potriviri reale', 'Site vechi + afacere prosperă. Nu „cel mai urât site”, ci cine are de câștigat.'],
                ['🎨', 'Un demo excelent', 'Redesign cu numele, serviciile și pozele lor reale, pe link live.'],
                ['📤', 'Mesaj personal', '„Am făcut un concept pentru site-ul vostru, fără obligații.” Trimis de tine, câteva pe zi.'],
              ].map(([i, t, d]) => (
                <div key={t} style={{ background: 'rgba(30,41,59,.45)', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 20 }}>{i}</div>
                  <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 13, marginTop: 4 }}>{t}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
              Nu automatiza trimiterea: mesajele în masă, formularele bombardate și DM-urile automate îți blochează contul și domeniul și pot încălca legislația anti-spam (GDPR / Legea 506/2004).
              Căutarea folosește API-ul oficial Google Places, cu max. 20 de rezultate pe căutare.
            </div>
          </div>
        )}

        {/* Căutare */}
        <div className="glass" style={{ borderRadius: 20, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <select value={city} onChange={e => setCity(e.target.value)} style={fieldStyle()}>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)} style={fieldStyle()}>
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={minReviews} onChange={e => setMinReviews(Number(e.target.value))} style={fieldStyle()}>
              {[5, 20, 40, 80, 150].map(n => <option key={n} value={n}>Min. {n} recenzii Google</option>)}
            </select>
            <Btn solid onClick={search} disabled={searching}>{searching ? '⏳ Caut…' : '🔍 Caută afaceri cu site'}</Btn>
          </div>
          {info && <div style={{ fontSize: 12, color: C.muted }}>{info}</div>}
          {err && <div style={{ fontSize: 13, color: C.red }}>⚠️ {err}</div>}
        </div>

        {/* Filtre + acțiuni */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['all', 'Active'], ['todo', 'De auditat'], ['good', '🎯 Site vechi'], ['pipeline', '🎨 În lucru'], ['contacted', '📤 Contactați'], ['won', '✅ Clienți'], ['skipped', 'Arhivă']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 0,
                background: filter === k ? '#3b82f6' : 'rgba(30,41,59,.6)', color: filter === k ? '#fff' : C.muted }}>
              {l} ({count(k)})
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {count('todo') > 0 && <Btn small onClick={auditBatch} disabled={!!auditing}>{auditing ? '⏳ Auditez…' : `🩺 Auditează ${Math.min(15, count('todo'))}`}</Btn>}
        </div>

        {/* Listă */}
        {filtered.length === 0 ? (
          <div className="glass" style={{ borderRadius: 20, padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
            {leads.length === 0 ? 'Începe cu o căutare: de ex. Cabinet Stomatologic în orașul tău, min. 20 recenzii.' : 'Nimic în acest filtru.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map(l => {
              const st = STAGE_INFO[l.stage]
              return (
                <div key={l.place_id} className="glass" style={{ borderRadius: 16, padding: 14, display: 'grid', gap: 8,
                  outline: auditing === l.place_id ? `1px solid ${C.blue}` : 'none' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 15 }}>{l.name}</span>
                        <Pill color={st.color}>{st.emoji} {st.label}</Pill>
                        {l.audit && <Pill color={C.amber}>🎯 {l.opportunity_score}</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {l.category_label} · {l.city.replace(' 🏘️', '')} · <span style={{ color: '#f59e0b' }}>★ {l.rating.toFixed(1)}</span> ({l.reviews_count}) ·{' '}
                        <a href={l.website} target="_blank" rel="noreferrer" style={{ color: C.blue }}>{l.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 36)}</a>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!l.audit && l.stage === 'found' && <Btn small onClick={() => setOpenId(l.place_id)}>🩺 Audit</Btn>}
                      {l.audit && l.stage === 'audited' && <Btn small color={C.amber} onClick={() => change(l.place_id, { stage: 'shortlisted' })}>⭐ Alege</Btn>}
                      <Btn small solid onClick={() => setOpenId(l.place_id)}>Deschide →</Btn>
                      {!['skipped', 'won'].includes(l.stage)
                        ? <Btn small color={C.dim} title="Nu e potrivit" onClick={() => change(l.place_id, { stage: 'skipped' })}>⏭️</Btn>
                        : <Btn small color={C.red} title="Șterge" onClick={() => setLeads(deleteRebuildLead(l.place_id))}>🗑</Btn>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: C.dim }}>
                      <span style={{ width: 90 }}>Plătește</span><Bar value={l.revenue_score} color={C.green} /><span style={{ width: 24, textAlign: 'right' }}>{l.revenue_score}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: C.dim }}>
                      <span style={{ width: 90 }}>Site vechi</span>
                      {l.audit ? <><Bar value={l.audit.outdated_score} color={scoreColor(l.audit.outdated_score)} /><span style={{ width: 24, textAlign: 'right' }}>{l.audit.outdated_score}</span></>
                        : <span style={{ fontStyle: 'italic' }}>{auditing === l.place_id ? 'se analizează…' : 'neauditat'}</span>}
                    </div>
                  </div>
                  {l.audit && l.audit.issues.length > 0 && (
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>{l.audit.issues.slice(0, 3).join(' · ')}</div>
                  )}
                  {l.preview_url && <div style={{ fontSize: 12 }}><a href={l.preview_url} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>🔗 {l.preview_url}</a></div>}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {open && settings && (
        <Workspace lead={open} settings={settings} onChange={u => change(open.place_id, u)} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}
