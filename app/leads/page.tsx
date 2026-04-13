'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  getLeads, addLeads, updateLead, deleteLead, clearLeads,
  getSettings, incrementTodaySent, getTodayStats,
} from '@/lib/storage'
import { CITY_COORDINATES, BUSINESS_CATEGORIES, JUDETE, HIGH_CONVERSION_CATEGORIES , MEGYEK, HU_CITIES } from '@/lib/constants'
import type { Business, Settings } from '@/lib/types'

const CITIES = Object.keys(CITY_COORDINATES).sort()
const CATEGORIES = Object.entries(BUSINESS_CATEGORIES)

// ─── helpers ──────────────────────────────────────────────────────────────────
const clr = {
  wa:    '#25D366',
  blue:  '#63b3ed',
  amber: '#f6ad55',
  red:   '#fc8181',
  green: '#4ade80',
}

function tag(color: string, text: string) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:20,
      fontSize:11, fontWeight:700, background:`${color}22`, color, border:`1px solid ${color}44` }}>
      {text}
    </span>
  )
}

function Stars({ r }: { r: number }) {
  return <span style={{ color:'#f59e0b', fontSize:12 }}>
    {'★'.repeat(Math.round(r))}{'☆'.repeat(5-Math.round(r))}
    <span style={{ color:'#475569', marginLeft:4 }}>{r.toFixed(1)}</span>
  </span>
}

const STAGE_LABELS: Record<string, [string,string]> = {
  new:          ['⬜','Nou'],
  sent_opening: ['📤','Trimis'],
  replied:      ['💬','Răspuns!'],
  demo_sent:    ['🎨','Demo trimis'],
  negotiating:  ['🤝','Negociere'],
  closed_won:   ['✅','Client!'],
  closed_lost:  ['❌','Pierdut'],
}

// ─── Modal container ──────────────────────────────────────────────────────────
function Modal({ onClose, children, wide = false }: { onClose:()=>void; children:React.ReactNode; wide?:boolean }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)',
        zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:12 }}>
      <div style={{ background:'#0b1628', border:'1px solid rgba(99,179,237,0.18)', borderRadius:20,
        width:'100%', maxWidth: wide ? 680 : 520, maxHeight:'92vh', overflow:'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ─── ConversationModal: full flow ─────────────────────────────────────────────
function ConversationModal({ biz, settings, onClose, onUpdate }:
  { biz:Business; settings:Settings; onClose:()=>void; onUpdate:(id:string,u:Partial<Business>)=>void }) {

  const [tab, setTab] = useState<'message'|'reply'|'demo'>('message')
  const [waMsg, setWaMsg] = useState(biz.generated_whatsapp || '')
  const [emailSubj, setEmailSubj] = useState(biz.generated_subject || '')
  const [emailBody, setEmailBody] = useState(biz.generated_body || '')
  const [emailTo, setEmailTo] = useState(biz.contact_email || '')
  const [replyText, setReplyText] = useState(biz.reply_text || '')
  const [followupMsg, setFollowupMsg] = useState('')
  const [demoHtml, setDemoHtml] = useState(biz.generated_demo_html || '')
  const [msgTab, setMsgTab] = useState<'wa'|'email'>('wa')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [copied, setCopied] = useState('')
  const [err, setErr] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const apiBase = {
    anthropicApiKey: settings.anthropicApiKey,
    senderName: settings.senderName,
    yourWebsite: settings.yourWebsite,
    yourPortfolio: settings.yourPortfolio,
    yourPhone: settings.yourPhone,
    priceFrom: settings.priceFrom,
    priceTo: settings.priceTo,
    deliveryDays: settings.deliveryDays,
  }

  async function generate(mode: string, extra?: Record<string,string>) {
    if (!settings.anthropicApiKey) { setErr('Adaugă Anthropic API key în Setări ⚙️'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/generate-message', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ business:biz, mode, variant:Math.floor(Math.random()*4), ...apiBase, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Eroare')
      if (data.whatsapp && mode !== 'followup') { setWaMsg(data.whatsapp); onUpdate(biz.place_id,{generated_whatsapp:data.whatsapp,status:'ready'}) }
      if (data.whatsapp && mode === 'followup')   setFollowupMsg(data.whatsapp)
      if (data.subject)  { setEmailSubj(data.subject); onUpdate(biz.place_id,{generated_subject:data.subject}) }
      if (data.body)     { setEmailBody(data.body);    onUpdate(biz.place_id,{generated_body:data.body,status:'ready'}) }
    } catch(e:unknown) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  async function generateDemo() {
    if (!settings.anthropicApiKey) { setErr('Adaugă Anthropic API key în Setări ⚙️'); return }
    setDemoLoading(true); setErr('')
    onUpdate(biz.place_id, { demo_status:'generating' })

    const cityClean = biz.city.replace(' 🏘️','')
    const hasRating = biz.rating >= 4.2 && biz.reviews_count >= 10
    const pFrom = settings.priceFrom || '500'
    const days  = settings.deliveryDays || '5'
    const sName = settings.senderName || 'Alexandru'
    const sPhone = settings.yourPhone || ''

    const COLOR_MAP: Record<string,string> = {
      beauty_salon:'#9d4edd', hair_care:'#9d4edd', lodging:'#2d6a4f',
      restaurant:'#d62828', bakery:'#c9a227', dentist:'#0077b6',
      doctor:'#0077b6', car_repair:'#1b4332', photographer:'#1d3557',
      gym:'#7209b7', florist:'#e63946', lawyer:'#1d3557',
      accounting:'#1d4ed8', veterinary_care:'#386641',
    }
    const color = COLOR_MAP[biz.category] || '#1d4ed8'
    const domainSlug = biz.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
    const waLink = biz.phone_intl ? `https://wa.me/${biz.phone_intl}` : ''
    const telLink = biz.phone ? `tel:${biz.phone.replace(/\s/g,'')}` : '#'
    const year = new Date().getFullYear()

    const prompt = `Generează un site web demo COMPLET în HTML/CSS pentru această afacere.

Afacere: ${biz.name} | Tip: ${biz.category_label} | Oraș: ${cityClean}
Telefon: ${biz.phone || 'nedisponibil'} | ${hasRating ? `Rating: ${biz.rating}★ (${biz.reviews_count} recenzii)` : ''}
Culoare: ${color} | Domeniu: ${domainSlug}.ro

STRUCTURA (toate secțiunile obligatorii):
1. Banner sticky (${color}): "✨ DEMO · Site în ${days} zile de la ${pFrom} RON · ${sName}${sPhone ? ' · '+sPhone : ''}"
2. Navbar alb: logo "${biz.name}" + buton telefon href="${telLink}"
3. Hero gradient ${color}: titlu, subtitlu, 2 butoane CTA
4. Servicii: 6 carduri cu emoji relevante pentru ${biz.category_label}
5. Despre noi: 2 paragrafe specifice domeniului
6. Galerie: 4 placeholder-uri (div gri + emoji + text)
7. ${hasRating ? `Recenzii: ${biz.rating}★ din ${biz.reviews_count} Google + 2 recenzii fictive` : '3 recenzii fictive pozitive'}
8. Contact: box ${color}, <a href="${telLink}">${biz.phone||''}</a>${waLink ? `, <a href="${waLink}">WhatsApp</a>` : ''}, adresă
9. Footer: ${domainSlug}.ro · © ${year} · "Site de ${sName}${sPhone?' · '+sPhone:''} · de la ${pFrom} RON · ${days} zile"

CSS: mobile responsive, animație fade-in, fără dependențe externe.
Returnează DOAR HTML complet începând cu <!DOCTYPE html>`

    try {
      // Rută separată cu maxDuration=300 și streaming — fără timeout Vercel
      const res = await fetch('/api/generate-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: biz,
          anthropicApiKey: settings.anthropicApiKey,
          senderName: settings.senderName,
          yourPhone: settings.yourPhone,
          priceFrom: settings.priceFrom,
          deliveryDays: settings.deliveryDays,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare generare demo')
      const finalHtml = data.demo_html || ''
      if (!finalHtml) throw new Error('Demo gol returnat')
      setDemoHtml(finalHtml)
      onUpdate(biz.place_id, { generated_demo_html: finalHtml, demo_status: 'ready' })
    } catch(e:unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      onUpdate(biz.place_id, { demo_status: 'none' })
    } finally {
      setDemoLoading(false)
    }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(()=>setCopied(''),2500) } catch {}
  }

  function openWA(msg: string) {
    if (!biz.whatsapp_link) return
    window.open(`${biz.whatsapp_link}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function markSent() {
    onUpdate(biz.place_id, { status:'sent', conversation_stage:'sent_opening', sent_at:new Date().toISOString(), contact_method:'whatsapp' })
    incrementTodaySent(true)
  }

  function downloadDemo() {
    if (!demoHtml) return
    const blob = new Blob([demoHtml], {type:'text/html'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `demo-${biz.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}.html`
    a.click()
  }

  const inputStyle = { width:'100%', background:'rgba(6,13,26,0.8)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:10, padding:'10px 14px', color:'#e2e8f0', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box' as const }
  const btnPrimary = (color='#25D366',color2='#128C7E') => ({ background:`linear-gradient(135deg,${color},${color2})`, color:'#fff', border:'none', borderRadius:12, padding:'11px 20px', fontWeight:700, fontSize:14, cursor:'pointer', transition:'transform .15s', display:'block', width:'100%', marginTop:8 })
  const btnGhost = { background:'rgba(255,255,255,0.05)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'6px 12px', fontWeight:600, fontSize:12, cursor:'pointer' }

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid rgba(99,179,237,0.1)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:800, color:'#f1f5f9', fontSize:17 }}>{biz.name}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{biz.category_label} · {HU_CITIES.includes(biz.city.replace(' 🏘️','').trim()) ? '🇭🇺 ' : ''}{biz.city.replace(' 🏘️','')}</div>
            <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#94a3b8' }}>📞 {biz.phone}</span>
              {biz.rating>0 && <Stars r={biz.rating} />}
              {biz.reviews_count>0 && <span style={{ fontSize:11, color:'#475569' }}>({biz.reviews_count} recenzii)</span>}
              {biz.is_small_city && tag('#f6ad55','🏘️ Oraș mic')}
              {biz.whatsapp_link && tag('#25D366','📱 WA')}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#475569', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        {/* Stage selector */}
        <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap' }}>
          {Object.entries(STAGE_LABELS).map(([k,[icon,label]])=>(
            <button key={k} onClick={()=>onUpdate(biz.place_id,{conversation_stage:k as Business['conversation_stage']})}
              style={{ padding:'4px 10px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer',
                background: biz.conversation_stage===k ? 'rgba(99,179,237,0.25)' : 'rgba(255,255,255,0.04)',
                color: biz.conversation_stage===k ? '#63b3ed' : '#475569' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Flow tabs */}
        <div style={{ display:'flex', gap:6, marginTop:12 }}>
          {(['message','reply','demo'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{ flex:1, padding:'8px 0', borderRadius:10, border:'none', fontWeight:700, fontSize:12, cursor:'pointer',
                background: tab===t
                  ? t==='demo' ? 'linear-gradient(135deg,#f6ad55,#ed8936)'
                  : t==='reply' ? 'linear-gradient(135deg,#63b3ed,#3b82f6)'
                  : 'linear-gradient(135deg,#25D366,#128C7E)'
                  : 'rgba(255,255,255,0.04)',
                color: tab===t ? '#fff' : '#475569' }}>
              {t==='message'?'1️⃣ Mesaj inițial': t==='reply'?'2️⃣ Răspuns primit':'3️⃣ Demo site'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:20 }}>
        {err && <div style={{ background:'rgba(252,129,129,0.1)', border:'1px solid rgba(252,129,129,0.3)', color:'#fc8181', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>⚠️ {err}</div>}

        {/* ── TAB 1: Mesaj inițial ── */}
        {tab==='message' && (
          <div>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {(['wa','email'] as const).map(t=>(
                <button key={t} onClick={()=>setMsgTab(t)}
                  style={{ flex:1, padding:'7px 0', borderRadius:9, border:'none', fontWeight:700, fontSize:12, cursor:'pointer',
                    background: msgTab===t ? (t==='wa'?'linear-gradient(135deg,#25D366,#128C7E)':'linear-gradient(135deg,#3b82f6,#1d4ed8)') : 'rgba(255,255,255,0.04)',
                    color: msgTab===t ? '#fff' : '#475569' }}>
                  {t==='wa'?'📱 WhatsApp':'✉️ Email'}
                </button>
              ))}
            </div>

            {msgTab==='wa' && (
              !waMsg ? (
                <div style={{ textAlign:'center', padding:'28px 0' }}>
                  <div style={{ fontSize:44, marginBottom:10 }}>🎯</div>
                  <div style={{ color:'#64748b', fontSize:13, marginBottom:18, lineHeight:1.6 }}>
                    AI generează un mesaj captivant, personalizat<br/>bazat pe datele reale din Google Maps
                  </div>
                  <button onClick={()=>generate('whatsapp')} disabled={loading}
                    style={{ ...btnPrimary(), width:'auto', padding:'12px 28px', display:'inline-block' }}>
                    {loading?'⏳ Generez...':'✨ Generează mesaj captivant'}
                  </button>
                  {!settings.anthropicApiKey && <p style={{ color:'#fc8181', fontSize:11, marginTop:8 }}>Configurează API key în ⚙️ Setări</p>}
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em' }}>Mesaj WhatsApp</span>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>generate('whatsapp')} disabled={loading} style={btnGhost}>{loading?'⏳':'🔄 Alt mesaj'}</button>
                    </div>
                  </div>
                  <textarea value={waMsg} onChange={e=>setWaMsg(e.target.value)} rows={6}
                    style={{ ...inputStyle, resize:'vertical', lineHeight:1.7 }} />
                  <div style={{ fontSize:11, color:'#334155', marginTop:4, marginBottom:2 }}>{waMsg.length} caractere · {waMsg.split('\n').filter(Boolean).length} rânduri</div>

                  {/* Preview bubble */}
                  <div style={{ background:'rgba(37,211,102,0.06)', border:'1px solid rgba(37,211,102,0.15)', borderRadius:12, padding:14, margin:'12px 0', borderTopLeftRadius:2 }}>
                    <div style={{ fontSize:11, color:'#25D366', fontWeight:700, marginBottom:6 }}>👁 Preview WhatsApp</div>
                    <div style={{ fontSize:14, color:'#e2e8f0', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{waMsg}</div>
                  </div>

                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={async()=>{ await copyText(waMsg,'wa'); openWA(waMsg); markSent(); }}
                      disabled={!biz.whatsapp_link}
                      style={{ ...btnPrimary(), flex:1, marginTop:0, padding:'13px', fontSize:15, opacity:biz.whatsapp_link?1:0.4 }}>
                      {copied==='wa'?'✅ Copiat! WA deschis...':'📱 Trimite pe WhatsApp'}
                    </button>
                    <button onClick={()=>copyText(waMsg,'copy')}
                      style={{ ...btnGhost, marginTop:0, padding:'13px 14px', fontSize:13 }}>
                      {copied==='copy'?'✅':'📋'}
                    </button>
                  </div>
                  <p style={{ fontSize:11, color:'#334155', textAlign:'center', marginTop:6 }}>
                    Mesajul e copiat automat + WhatsApp se deschide
                  </p>
                </>
              )
            )}

            {msgTab==='email' && (
              !emailSubj ? (
                <div style={{ textAlign:'center', padding:'28px 0' }}>
                  <div style={{ fontSize:44, marginBottom:10 }}>✉️</div>
                  <div style={{ color:'#64748b', fontSize:13, marginBottom:18 }}>AI generează un email cu subiect captivant</div>
                  <button onClick={()=>generate('email')} disabled={loading}
                    style={{ ...btnPrimary('#3b82f6','#1d4ed8'), width:'auto', padding:'12px 28px', display:'inline-block' }}>
                    {loading?'⏳ Generez...':'✨ Generează email'}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:6 }}>Email destinatar</label>
                    <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="email@afacere.ro" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em' }}>Subiect</label>
                      <button onClick={()=>generate('email')} disabled={loading} style={btnGhost}>{loading?'⏳':'🔄'}</button>
                    </div>
                    <input value={emailSubj} onChange={e=>setEmailSubj(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:6 }}>Corp email</label>
                    <textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)} rows={8}
                      style={{ ...inputStyle, resize:'vertical', lineHeight:1.6 }} />
                  </div>
                  <button onClick={()=>{ if(emailTo&&emailSubj&&emailBody) window.location.href=`mailto:${emailTo}?subject=${encodeURIComponent(emailSubj)}&body=${encodeURIComponent(emailBody)}`; }}
                    disabled={!emailTo||!emailSubj||!emailBody}
                    style={{ ...btnPrimary('#3b82f6','#1d4ed8'), padding:'13px', fontSize:15 }}>
                    ✉️ Deschide în Mail
                  </button>
                </>
              )
            )}
          </div>
        )}

        {/* ── TAB 2: Răspuns primit ── */}
        {tab==='reply' && (
          <div>
            <div style={{ background:'rgba(99,179,237,0.06)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:12, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#63b3ed', fontWeight:700, marginBottom:8 }}>💡 Fluxul corect</div>
              <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.7 }}>
                <strong style={{ color:'#e2e8f0' }}>1.</strong> Notezi ce a răspuns clientul<br/>
                <strong style={{ color:'#e2e8f0' }}>2.</strong> Generezi răspunsul perfect cu AI<br/>
                <strong style={{ color:'#e2e8f0' }}>3.</strong> Dacă e interesat → treci la tab 3 Demo
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:6 }}>
                Ce a răspuns clientul?
              </label>
              <textarea value={replyText} onChange={e=>{ setReplyText(e.target.value); onUpdate(biz.place_id,{reply_text:e.target.value, conversation_stage:'replied', replied_at:new Date().toISOString()}) }}
                placeholder={'ex: "Da, ce presupune?", "Nu mulțumesc", "Cât costă?", "Am deja site"...'}
                rows={3} style={{ ...inputStyle, resize:'vertical' }} />
            </div>

            {replyText && (
              <button onClick={()=>generate('followup',{replyText})} disabled={loading}
                style={{ ...btnPrimary('#63b3ed','#3b82f6'), padding:'12px', fontSize:14, marginBottom:8 }}>
                {loading?'⏳ Generez răspuns...':'🤖 Generează răspuns perfect'}
              </button>
            )}

            {followupMsg && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8, marginTop:14 }}>Răspunsul tău</div>
                <textarea value={followupMsg} onChange={e=>setFollowupMsg(e.target.value)} rows={5}
                  style={{ ...inputStyle, resize:'vertical', lineHeight:1.7 }} />
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button onClick={()=>{ copyText(followupMsg,'fu'); openWA(followupMsg); }}
                    disabled={!biz.whatsapp_link}
                    style={{ ...btnPrimary(), flex:1, marginTop:0, padding:'11px', opacity:biz.whatsapp_link?1:0.4 }}>
                    {copied==='fu'?'✅ Copiat!':'📱 Trimite răspunsul'}
                  </button>
                  <button onClick={()=>copyText(followupMsg,'fuc')} style={{ ...btnGhost, marginTop:0, padding:'11px 14px' }}>
                    {copied==='fuc'?'✅':'📋'}
                  </button>
                </div>
                <div style={{ marginTop:14, padding:12, background:'rgba(37,211,102,0.06)', border:'1px solid rgba(37,211,102,0.15)', borderRadius:10 }}>
                  <div style={{ fontSize:12, color:'#25D366', fontWeight:700, marginBottom:6 }}>💡 Pasul următor recomandat</div>
                  <div style={{ fontSize:13, color:'#94a3b8' }}>Dacă e interesat → apasă tab-ul <strong style={{ color:'#f6ad55' }}>3️⃣ Demo site</strong> și generează demo-ul personalizat gratuit.</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 3: Demo site — Copiază Prompt ── */}
        {tab==='demo' && (
          <div>
            {/* Explicație flux */}
            <div style={{ background:'rgba(246,173,85,0.07)', border:'1px solid rgba(246,173,85,0.2)', borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, color:'#f6ad55', fontWeight:800, marginBottom:10 }}>🎨 Cum generezi demo-ul premium</div>
              <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.9 }}>
                <span style={{ color:'#f1f5f9', fontWeight:700 }}>1.</span> Apasă <strong style={{ color:'#fbbf24' }}>"Copiază Prompt Demo"</strong> de mai jos<br/>
                <span style={{ color:'#f1f5f9', fontWeight:700 }}>2.</span> Deschide <strong style={{ color:'#63b3ed' }}>claude.ai</strong> în browser<br/>
                <span style={{ color:'#f1f5f9', fontWeight:700 }}>3.</span> Dai <strong style={{ color:'#f1f5f9' }}>Paste</strong> și trimiți — demo-ul apare în 30 secunde<br/>
                <span style={{ color:'#f1f5f9', fontWeight:700 }}>4.</span> Descarci HTML-ul și îl trimiți pe WhatsApp
              </div>
            </div>

            {/* Prompt preview */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
                Preview prompt generat
              </div>
              <div style={{ background:'rgba(6,13,26,0.8)', border:'1px solid rgba(99,179,237,0.12)', borderRadius:10, padding:14, fontSize:12, color:'#64748b', lineHeight:1.7, maxHeight:160, overflowY:'auto', fontFamily:'monospace' }}>
                {`Generează un site web demo COMPLET, nivel senior front-end + senior UX/UI 2026, pentru:

Afacere: ${biz.name}
Tip: ${biz.category_label}
Oraș: ${biz.city.replace(' 🏘️','')}
Telefon: ${biz.phone}
${biz.rating>0?`Rating Google: ${biz.rating}★ (${biz.reviews_count} recenzii)`:'Fără rating disponibil'}
Adresă: ${biz.address||biz.city.replace(' 🏘️','')}

[...tehnici premium: mesh gradient, glassmorphism, 3D hover, reveal animations, hamburger menu, floating badges, pulse ring, noise texture, stats bar, gallery grid asimetric]`}
              </div>
            </div>

            {/* Buton principal */}
            <button onClick={()=>{
              const cityClean = biz.city.replace(' 🏘️','')
              const sName = settings.senderName || 'Alexandru'
              const sPhone = settings.yourPhone || ''
              const pFrom = settings.priceFrom || '500'
              const pTo = settings.priceTo || '1500'
              const days = settings.deliveryDays || '5'
              const port = settings.yourPortfolio || ''

              const COLOR_MAP: Record<string,string> = {
                beauty_salon:'#9d4edd', hair_care:'#9d4edd', lodging:'#2d6a4f',
                restaurant:'#d62828', bakery:'#c9a227', dentist:'#0077b6',
                doctor:'#0077b6', car_repair:'#1b4332', photographer:'#1d3557',
                gym:'#7209b7', florist:'#e63946', lawyer:'#1d3557',
                accounting:'#1d4ed8', veterinary_care:'#386641',
                moving_company:'#1d4ed8', physiotherapist:'#0077b6',
                car_wash:'#1b4332', painter:'#6c3d14',
              }
              const color = COLOR_MAP[biz.category] || '#1d4ed8'
              const domainSlug = biz.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
              const waLink = biz.phone_intl ? `https://wa.me/${biz.phone_intl}` : ''
              const telRaw = biz.phone?.replace(/\s/g,'') || ''
              const year = new Date().getFullYear()

              const prompt = `Generează un site web demo COMPLET, single-file HTML, nivel senior front-end developer + senior UX/UI designer 2026. Site-ul trebuie să arate WOW — ca un produs livrat de o agenție premium internațională, nu un template generic AI.

━━━ DATELE AFACERII ━━━
Nume: ${biz.name}
Tip: ${biz.category_label}
Oraș: ${cityClean}
Telefon: ${biz.phone || 'nedisponibil'}
${biz.rating > 0 ? `Rating Google: ${biz.rating}★ (${biz.reviews_count} recenzii)` : 'Fără rating disponibil'}
Adresă: ${biz.address || cityClean}
${biz.is_small_city ? `Context: primul din ${cityClean} cu prezență online — avantaj enorm` : ''}
Domeniu sugerat: ${domainSlug}.ro
Telefon href: tel:${telRaw}
${waLink ? `WhatsApp: ${waLink}` : ''}

━━━ DATELE TALE ━━━
Realizat de: ${sName}${sPhone ? ' · ' + sPhone : ''}
Preț de la: ${pFrom} RON | Livrare: ${days} zile
${port ? `Portofoliu: ${port}` : ''}

━━━ IMAGINI — OBLIGATORIU Pexels CDN ━━━
Format: https://images.pexels.com/photos/[ID]/pexels-photo-[ID].jpeg?auto=compress&cs=tinysrgb&w=[W]
Alege ID-uri REALE și RELEVANTE pentru "${biz.category_label}":
${(() => {
  const pexMap: Record<string,string> = {
    beauty_salon: '3993449,3992874,3997381,3065209,3764013,3764568,3993456,2681835,3997391',
    hair_care: '3992874,3065209,3065171,3065172,1319460,3065173,1323550,3065174,2104062',
    lodging: '164595,271624,1134176,2598638,258154,1743229,189296,1457842,2417842',
    restaurant: '262978,1640777,67468,941861,1307698,3184183,2253643,958545,1267320',
    bakery: '1070850,1775031,1126359,2693447,1729797,3926124,205961,1775032,1775033',
    dentist: '3845810,3845811,3845746,5215997,4386466,3938023,3938024,3845812,5215998',
    doctor: '3845810,5215997,4386466,3938023,4167541,5452255,3938024,4167542,5486649',
    car_repair: '3807517,3807386,1592384,3807571,2244746,3807460,1635108,3807518,3807519',
    photographer: '3062541,1264210,3184418,3379915,1983037,3184177,1264211,3379916,1983038',
    gym: '841130,1552249,3253501,416778,2261482,1552106,841131,1552250,3253502',
    florist: '931177,56866,1179156,2879219,931178,56867,1179157,2879220,931179',
    lawyer: '3760263,3184291,1181534,3153201,3184292,1181535,3153202,3184293,3760264',
    accounting: '3760263,3184291,1181534,3153201,3184292,3760264,1181535,3153202,3184293',
    veterinary_care: '1108099,3628273,4587987,4473914,1108100,3628274,4587988,4473915,1108101',
    moving_company: '4246163,4246164,4246165,1427107,4246166,1427108,4246167,1427109,4246168',
    painter: '1249611,2219024,1396122,3637728,2098914,1541123,1249612,2219025,1396123',
    car_wash: '3807517,2244746,3807460,1592384,3807386,2244747,3807518,1592385,3807519',
    default: '1181671,1181534,3184291,3760263,1181535,3184292,3760264,1181536,3184293',
  }
  return pexMap[biz.category] || pexMap['default']
})()}

Distribuție poze:
- Hero background: 1 poză w=1600 (prima din lista de mai sus)
- Servicii: 6 poze w=800 diferite (relevante fiecărui serviciu specific)
- About: 1 poză w=900
- Galerie: 1 poză w=1000 + 4 poze w=600
- Reviews hero: 1 poză w=1600 + 3 poze recenzii w=500
- Contact: 1 poză w=900

━━━ AESTHETIC DIRECTION ━━━
${(() => {
  const aesthetics: Record<string,string> = {
    beauty_salon: `LUXURY EDITORIAL (Charlotte Tilbury, Vogue)
- Fond: ivory #faf7f2 + dark #0e0c0a
- Fonturi: Cormorant Garamond (display, italic, 300) + Montserrat (body, 300)
- Accente: gold #c9a96e + rose #c8a99a
- Hero: SPLIT SCREEN 50/50 (foto stânga, text dark dreapta)
- Servicii: numerotare 01-06, border grid editorial, fără emoji
- Ton: rafinat, liniștit, luxos`,
    hair_care: `LUXURY EDITORIAL (Charlotte Tilbury, Vogue)
- Fond: ivory #faf7f2 + dark #0e0c0a
- Fonturi: Cormorant Garamond + Montserrat 300
- Accente: gold #c9a96e + rose #c8a99a
- Hero: SPLIT SCREEN
- Numerotare 01-06, zero emoji în conținut`,
    lodging: `BOUTIQUE HOTEL (Mr & Mrs Smith, Firmdale)
- Fond: warm white #fefcf8 + forest #1a2e1a
- Fonturi: Playfair Display italic + Lato 300
- Accente: sage green #7d9e7d + warm gold #c9a040
- Hero: FULL BLEED foto cu overlay text stânga
- Carduri cu colțuri drepte, lux minimalist`,
    restaurant: `WARM EDITORIAL (Bon Appétit, Ottolenghi)
- Fond: cream #fffbf5 + charcoal #1c1c1c
- Fonturi: Playfair Display + Lato 300
- Accente: terracotta #c1440e + warm amber #e8c547
- Hero: FULL BLEED foto cu overlay gradient
- Cards edge-to-edge, fotografie dominantă`,
    bakery: `ARTISAN WARMTH (Kinfolk, Little Flower)
- Fond: off-white #fdf6ec + warm dark #1e1612
- Fonturi: Libre Baskerville italic + Source Sans Pro 300
- Accente: terracotta #c95c2c + honey #e8a835
- Hero: FULL BLEED cu grain texture CSS overlay
- Layout organic, carduri cu raze mari`,
    dentist: `CLEAN CLINICAL PREMIUM (Forward Health, Tend)
- Fond: pure white + soft azure #f0f7ff
- Fonturi: DM Serif Display + DM Sans 300
- Accente: deep teal #0d7377 + light aqua #84d2d7
- Hero: SPLIT (text alb stânga, foto dreapta)
- Design ultra-curat, spațiu alb generos`,
    doctor: `CLINICAL TRUST (One Medical, Parsley Health)
- Fond: white + soft blue #f0f6ff
- Fonturi: DM Serif Display + DM Sans
- Accente: deep blue #1e40af + mint #10b981
- Hero: clean split, tipografie de încredere`,
    car_repair: `INDUSTRIAL BOLD (Speedy, fast lane feel)
- Fond: concrete #f4f4f2 + pitch black #111
- Fonturi: Oswald 700 uppercase + Roboto 300
- Accente: orange #ff6b35 + steel #64748b
- Hero: FULL BLEED dramatic, text overlay supradimensionat
- Energie, putere, precizie`,
    photographer: `EDITORIAL DARK (Type A, Helmut Newton feel)
- Fond: black #0a0a0a + off-white #f5f5f0
- Fonturi: Bebas Neue titluri + Raleway 300 body
- Accente: white + warm silver
- Hero: FULL BLEED B&W cu text alb
- Galerie dominantă, fotografia vorbește`,
    gym: `ATHLETIC POWER (Nike, Peloton)
- Fond: black #0a0a0a + white pur
- Fonturi: Barlow Condensed 800 uppercase + Barlow 400
- Accente: electric yellow #f5e642 + red #ef4444
- Hero: FULL BLEED foto cu text supradimensionat alb
- Energie, diagonal cuts, maximă intensitate`,
    florist: `GARDEN LUXURY (Bloom & Wild, Tulipina)
- Fond: blush white #fef9f7 + deep forest #1a2e1a
- Fonturi: Cormorant Garamond italic + Montserrat 300
- Accente: blush rose #e8a4a4 + deep green #2d5a27
- Hero: SPLIT SCREEN cu foto florală
- Elegant, feminin, organic`,
    default: `PROFESSIONAL PREMIUM
- Fond: white #ffffff + dark navy #0f172a
- Fonturi: Merriweather + Inter 300
- Accente: deep blue #1d4ed8 + gold #b8960c
- Hero: SPLIT tipografic
- Curat, de încredere, modern`,
  }
  return aesthetics[biz.category] || aesthetics['default']
})()}

━━━ STRUCTURA COMPLETĂ ━━━

1. DEMO BANNER: gradient shimmer animat, text "Demo · ${biz.name} · ${cityClean} · ${days} zile de la ${pFrom} RON · ${sName}"

2. NAVBAR glassmorphism: logo display font, links 11px uppercase letter-spacing, CTA button, hamburger → X animat

3. MOBILE MENU: overlay dark, links display font 36-44px italic, fade-in animat

4. HERO (adaptat aesthetic-ului ales):
   - Foto Pexels full-bleed sau split-screen
   - Ken Burns zoom pe imagine (scale 1.08→1.15, 16s infinite)
   - Eyebrow label 11px uppercase
   - H1 clamp(48px, 8vw, 96px) font display, weight 300, italic em
   - Subtitlu 14px, opacity 0.65
   - 2 butoane: primary solid + ghost
   ${biz.rating > 0 ? `- Rating badge glassmorphism: ${biz.rating}★ · ${biz.reviews_count} recenzii` : ''}
   - Scroll indicator animat (linie verticală + text rotit)
   - fadeUp staggered pe toate elementele

5. MARQUEE STRIP: dark background, serviciile iterate, font serif italic, animație continuă

6. STATS BAR: translateY(-52px) overlapping, border grid, numere display font mari
   Stats relevante: ${biz.rating > 0 ? `${biz.reviews_count}+ recenzii, ${biz.rating}★ rating` : '4 statistici relevanate domeniului'}

7. SERVICII editorial: 6 servicii specifice domeniului "${biz.category_label}"
   - Layout grid asimetric (primul card span 2 rânduri)
   - Foto Pexels + zoom hover + overlay
   - Numerotare 01-06, ZERO emoji, "Descoperă →" link

8. DESPRE NOI split: foto cu 2 floating badges animate + text cu 4 features linie decorativă

9. GALERIE masonry: 3 col × 2 rânduri, prima foto span 2, caption italic hover

10. RECENZII: hero foto full-width cu rating suprapus + grid 3 cards cu foto mică sus

11. CONTACT split: foto stânga, dark dreapta, telefon mare, WhatsApp SVG (fără emoji), 3 info rows

12. FOOTER dark: 4 coloane grid, brand italic, links, contact, bottom bar cu domeniu

━━━ TEHNICI OBLIGATORII ━━━
- Google Fonts import (fonturile din aesthetic)
- Custom cursor cu lag (desktop, mix-blend-mode:difference)
- IntersectionObserver reveal: .rv fadeUp, .rv-left, .rv-right
- Navbar .scrolled shadow
- Image fade-in on load (opacity 0→1) + error fallback gradient
- Smooth scroll cu offset navbar
- ZERO emoji în conținut (linii decorative, numere, SVG în loc)
- WhatsApp cu SVG logo inline, nu emoji

━━━ OUTPUT ━━━
Returnează DOAR HTML complet. Prima linie: <!DOCTYPE html>
Fără backticks, fără explicații.`

              navigator.clipboard.writeText(prompt).then(()=>{
                alert('✅ Prompt copiat!\n\nDeschide claude.ai și dă Paste!')
              }).catch(()=>{
                // Fallback: show in textarea
                const ta = document.createElement('textarea')
                ta.value = prompt
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
                alert('✅ Prompt copiat! Deschide claude.ai și dă Paste!')
              })
              onUpdate(biz.place_id, { conversation_stage:'demo_sent' })
            }}
            style={{ ...btnPrimary('#f6ad55','#ed8936'), padding:'16px', fontSize:16, fontWeight:800 }}>
              📋 Copiază Prompt Demo pentru Claude.ai
            </button>

            <div style={{ marginTop:10, padding:12, background:'rgba(99,179,237,0.06)', border:'1px solid rgba(99,179,237,0.12)', borderRadius:10 }}>
              <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.8 }}>
                <strong style={{ color:'#63b3ed' }}>De ce mai rapid?</strong> Claude.ai generează direct în chat fără limite de timeout. Demo-ul apare în 30 secunde și îl descarci instant.
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Score breakdown helper ─────────────────────────────────────────────────
function ScoreBreakdown({ biz }: { biz: Business }) {
  const [show, setShow] = useState(false)
  const score = biz.conversion_score || 0
  const month = new Date().getMonth() + 1

  const SEASONAL: Record<string,number[]> = {
    bakery:[3,4,11,12],florist:[2,3,4,5,11,12],restaurant:[3,4,5,6,7,8,12],
    lodging:[5,6,7,8,12,1],photographer:[4,5,6,7,8,9,10],
    beauty_salon:[3,4,5,6,9,10,11,12],hair_care:[3,4,5,6,9,10,11,12],
    car_repair:[3,4,10,11],car_wash:[3,4,5,6,7,8,9],gym:[1,2,8,9],
    painter:[4,5,6,7,8],dentist:[1,2,3,4,5,6,7,8,9,10,11,12],
  }
  const inSeason = SEASONAL[biz.category]?.includes(month)

  // Reconstruct individual points
  const pts = {
    reviews: biz.reviews_count>=100?30:biz.reviews_count>=50?24:biz.reviews_count>=30?18:biz.reviews_count>=15?12:biz.reviews_count>=5?6:0,
    rating:  biz.rating>=4.8?25:biz.rating>=4.5?20:biz.rating>=4.0?14:biz.rating>=3.5?7:biz.rating>0?3:8,
    season:  inSeason?20:5,
    city:    biz.is_small_city?15:0,
    wa:      biz.whatsapp_link?10:0,
  }

  return (
    <div style={{ position:'relative', display:'inline-block' }}>
      <button
        onClick={()=>setShow(!show)}
        style={{ background:'none', border:'none', cursor:'pointer', padding:'0 2px', fontSize:11, color:'#334155', fontWeight:600, lineHeight:1 }}
        title="Vezi detalii scor"
      >
        {score} ⓘ
      </button>
      {show && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', right:0, zIndex:50,
          background:'#0f1a2e', border:'1px solid rgba(99,179,237,0.2)',
          borderRadius:10, padding:12, width:220, boxShadow:'0 8px 32px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#f1f5f9', marginBottom:8 }}>
            Scor conversie: {score}/100
          </div>
          {[
            { label:'Recenzii Google', pts:pts.reviews, max:30, note:`${biz.reviews_count} recenzii` },
            { label:'Rating',         pts:pts.rating,  max:25, note:biz.rating>0?`${biz.rating}★`:'fără rating' },
            { label:'Sezon acum',     pts:pts.season,  max:20, note:inSeason?'în sezon ✓':'off-season' },
            { label:'Oraș mic',       pts:pts.city,    max:15, note:biz.is_small_city?'concurență zero ✓':'oraș mare' },
            { label:'WhatsApp',       pts:pts.wa,      max:10, note:biz.whatsapp_link?'disponibil ✓':'lipsă' },
          ].map(r=>(
            <div key={r.label} style={{ marginBottom:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{r.label}</span>
                <span style={{ fontSize:11, fontWeight:700, color: r.pts===r.max?'#4ade80':r.pts>0?'#f6ad55':'#475569' }}>
                  {r.pts}/{r.max}
                </span>
              </div>
              <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(r.pts/r.max)*100}%`, background: r.pts===r.max?'#4ade80':r.pts>0?'#f6ad55':'transparent', borderRadius:2 }} />
              </div>
              <div style={{ fontSize:10, color:'#334155', marginTop:1 }}>{r.note}</div>
            </div>
          ))}
          <button onClick={()=>setShow(false)} style={{ position:'absolute',top:6,right:8,background:'none',border:'none',color:'#334155',cursor:'pointer',fontSize:14 }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ─── LeadCard ──────────────────────────────────────────────────────────────────
function LeadCard({ biz, settings, onUpdate, onDelete }:
  { biz:Business; settings:Settings; onUpdate:(id:string,u:Partial<Business>)=>void; onDelete:(id:string)=>void }) {
  const [open, setOpen] = useState(false)
  const [sl,ssl] = STAGE_LABELS[biz.conversation_stage||'new']||['⬜','Nou']

  const score = biz.conversion_score || 0

  // Border color: stage overrides score
  const borderColor = biz.conversation_stage==='closed_won'   ? 'rgba(74,222,128,0.4)'
    : biz.conversation_stage==='replied'||biz.conversation_stage==='negotiating' ? 'rgba(246,173,85,0.4)'
    : score>=80 ? 'rgba(239,68,68,0.35)'
    : score>=65 ? 'rgba(249,115,22,0.25)'
    : score>=45 ? 'rgba(234,179,8,0.2)'
    : 'rgba(99,179,237,0.08)'

  // Glow for hot leads
  const boxShadow = score>=80 && biz.conversation_stage==='new'
    ? '0 0 16px rgba(239,68,68,0.12)' : 'none'

  return (
    <>
      <div style={{ background:'rgba(13,22,41,0.9)', border:`1px solid ${borderColor}`, borderRadius:14, padding:16, boxShadow }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:3 }}>
              <span style={{ fontWeight:700, color:'#f1f5f9', fontSize:14 }}>{biz.name}</span>
              {biz.is_small_city && <span title="Oraș mic — concurență zero">🏘️</span>}
              {tag(
                biz.conversation_stage==='closed_won' ? '#4ade80'
                : biz.conversation_stage==='replied'||biz.conversation_stage==='negotiating' ? '#f6ad55'
                : biz.conversation_stage==='sent_opening' ? '#63b3ed'
                : '#475569',
                `${sl} ${ssl}`
              )}
            </div>
            <div style={{ fontSize:12, color:'#64748b' }}>{biz.category_label} · {HU_CITIES.includes(biz.city.replace(' 🏘️','').trim()) ? '🇭🇺 ' : ''}{biz.city.replace(' 🏘️','')}</div>
          </div>
          <button onClick={()=>onDelete(biz.place_id)} style={{ background:'none',border:'none',color:'#2d3f5a',cursor:'pointer',fontSize:16 }}>✕</button>
        </div>

        {/* Scor conversie */}
        {score > 0 ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:2,
                width:`${score}%`,
                background: score>=80 ? 'linear-gradient(90deg,#ef4444,#f97316)'
                  : score>=65 ? 'linear-gradient(90deg,#f97316,#eab308)'
                  : score>=45 ? 'linear-gradient(90deg,#eab308,#84cc16)'
                  : 'rgba(100,116,139,0.4)',
                transition:'width .6s ease',
              }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
              <span style={{ fontSize:12 }}>{biz.score_emoji||'❄️'}</span>
              <span style={{ fontSize:11, fontWeight:800, color:biz.score_color||'#64748b' }}>{biz.score_label||'Cold'}</span>
              <ScoreBreakdown biz={biz} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize:10, color:'#1e293b', marginBottom:8 }}>Scor indisponibil — re-caută lead-ul</div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#94a3b8' }}>📞 {biz.phone}</span>
          {biz.rating>0 && <Stars r={biz.rating} />}
          {biz.reviews_count>0 && <span style={{ fontSize:11, color:'#475569' }}>({biz.reviews_count})</span>}
          {biz.whatsapp_link && tag('#25D366','📱 WA')}
          {biz.demo_status==='ready' && tag('#f6ad55','🎨 Demo gata')}
        </div>

        {/* Reply preview */}
        {biz.reply_text && (
          <div style={{ background:'rgba(246,173,85,0.08)', border:'1px solid rgba(246,173,85,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#f6ad55' }}>
            💬 "{biz.reply_text.slice(0,60)}{biz.reply_text.length>60?'...':''}"
          </div>
        )}

        <button onClick={()=>setOpen(true)}
          style={{ width:'100%', padding:'10px 16px', borderRadius:11, cursor:'pointer', fontWeight:700, fontSize:13, transition:'transform .12s',
            background: biz.conversation_stage==='closed_won' ? 'linear-gradient(135deg,#4ade80,#16a34a)'
              : biz.conversation_stage==='replied'||biz.conversation_stage==='negotiating' ? 'linear-gradient(135deg,#f6ad55,#ed8936)'
              : biz.whatsapp_link ? 'linear-gradient(135deg,rgba(37,211,102,0.2),rgba(18,140,126,0.2))'
              : 'rgba(99,179,237,0.12)',
            boxShadow: biz.conversation_stage==='replied' ? '0 0 16px rgba(246,173,85,0.25)' : 'none',
            border: biz.conversation_stage==='replied' ? '1px solid rgba(246,173,85,0.4)'
              : biz.whatsapp_link ? '1px solid rgba(37,211,102,0.3)' : '1px solid rgba(99,179,237,0.2)',
            color: biz.conversation_stage==='replied'||biz.conversation_stage==='negotiating' ? '#1a0f00'
              : biz.whatsapp_link ? '#25D366' : '#63b3ed' }}>
          {biz.conversation_stage==='closed_won' ? '✅ Client câștigat!'
            : biz.conversation_stage==='replied' ? '💬 A răspuns! → Vezi & răspunde'
            : biz.conversation_stage==='demo_sent' ? '🎨 Demo trimis → Urmărire'
            : biz.conversation_stage==='negotiating' ? '🤝 În negociere → Continuă'
            : biz.status==='sent' ? '📤 Trimis · Deschide conversația'
            : biz.whatsapp_link ? '📱 Deschide & Trimite'
            : '✉️ Scrie email'}
        </button>
      </div>

      {open && (
        <ConversationModal
          biz={biz}
          settings={settings}
          onClose={()=>setOpen(false)}
          onUpdate={(id,u)=>{ onUpdate(id,u); }}
        />
      )}
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const [leads, setLeads]       = useState<Business[]>([])
  const [settings, setSettings] = useState<Settings>({} as Settings)
  const [city, setCity]         = useState('Câmpia Turzii 🏘️')
  const [category, setCategory] = useState('beauty_salon')
  const [searchMode, setSearchMode] = useState<'city'|'judet'|'megye'>('city')
  const [judet, setJudet]       = useState('Cluj')
  const [megye, setMegye]       = useState('Budapest')
  const [country, setCountry]   = useState<'ro'|'hu'>('ro')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [filter, setFilter]     = useState<'all'|'hot'|'found'|'sent'|'replied'|'demo'|'won'>('all')
  const [genProgress, setGenProgress] = useState<{done:number,total:number}|null>(null)
  const [marketData, setMarketData] = useState<{
    totalFound:number; withWebsite:number; withoutWebsite:number;
    saturationPct:number; opportunityPct:number;
    verdict:{ label:string; emoji:string; color:string; msg:string }
  }|null>(null)

  useEffect(() => {
    const raw = getLeads()

    // Migrare automată: leads vechi fără scor primesc scor calculat client-side
    const SEASONAL: Record<string,number[]> = {
      bakery:[3,4,11,12],florist:[2,3,4,5,11,12],restaurant:[3,4,5,6,7,8,12],
      lodging:[5,6,7,8,12,1],photographer:[4,5,6,7,8,9,10],
      beauty_salon:[3,4,5,6,9,10,11,12],hair_care:[3,4,5,6,9,10,11,12],
      car_repair:[3,4,10,11],car_wash:[3,4,5,6,7,8,9],gym:[1,2,8,9],
      painter:[4,5,6,7,8],dentist:[1,2,3,4,5,6,7,8,9,10,11,12],
    }
    const month = new Date().getMonth()+1

    const migrated = raw.map(b => {
      if (b.conversion_score) return b  // già ha scor, skip
      const reviews = b.reviews_count||0
      const rating  = b.rating||0
      const inSeason = SEASONAL[b.category]?.includes(month)
      const hasWA = !!b.whatsapp_link
      const isSmall = !!b.is_small_city

      let score = 0
      score += reviews>=100?30:reviews>=50?24:reviews>=30?18:reviews>=15?12:reviews>=5?6:0
      score += rating>=4.8?25:rating>=4.5?20:rating>=4.0?14:rating>=3.5?7:rating>0?3:8
      score += inSeason?20:5
      score += isSmall?15:0
      score += hasWA?10:0
      score = Math.min(100, score)

      const label = score>=80?'Hot':score>=65?'Warm':score>=45?'Maybe':'Cold'
      const color = score>=80?'#ef4444':score>=65?'#f97316':score>=45?'#eab308':'#64748b'
      const emoji = score>=80?'🔥':score>=65?'⚡':score>=45?'👍':'❄️'

      return { ...b, conversion_score:score, score_label:label, score_color:color, score_emoji:emoji }
    })

    // Salvează migrarea și sortează după scor
    if (migrated.some((b,i) => !raw[i]?.conversion_score)) {
      const { saveLeads } = require('@/lib/storage')
      saveLeads(migrated)
    }

    const sorted = [...migrated].sort((a,b) => (b.conversion_score||0)-(a.conversion_score||0))
    setLeads(sorted)
    setSettings(getSettings())
  }, [])

  function handleUpdate(id: string, updates: Partial<Business>) {
    updateLead(id, updates)
    setLeads(getLeads())
  }
  function handleDelete(id: string) { deleteLead(id); setLeads(getLeads()) }

  async function searchCityCategory(c: string, cat: string): Promise<{businesses:Business[], market:typeof marketData}> {
    const res = await fetch('/api/find-businesses', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ city:c, category:cat, googleApiKey:settings.googlePlacesApiKey }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error||'Eroare API')
    const businesses = (data.businesses||[]).map((b: Business) => ({
      ...b,
      generated_demo_html: '',
      demo_status: 'none',
      conversation_stage: 'new',
      reply_text: '',
      notes: '',
    }))
    return { businesses, market: data.market || null }
  }

  async function handleSearch() {
    if (!settings.googlePlacesApiKey) { setSearchError('Configurează Google Places API key în Setări ⚙️'); return }
    setSearching(true); setSearchError(''); setMarketData(null)
    try {
      let all: Business[] = []
      let aggMarket = { totalFound:0, withWebsite:0, withoutWebsite:0, saturationPct:0, opportunityPct:0, verdict: {label:'',emoji:'',color:'',msg:''} }
      const cities = searchMode==='judet'&&judet ? JUDETE[judet]||[] : searchMode==='megye'&&megye ? MEGYEK[megye]||[] : [city]
      for (const c of cities) {
        try {
          const { businesses, market } = await searchCityCategory(c, category)
          all = [...all, ...businesses]
          if (market) {
            aggMarket.totalFound     += market.totalFound
            aggMarket.withWebsite    += market.withWebsite
            aggMarket.withoutWebsite += market.withoutWebsite
          }
        } catch {}
      }
      // Recalculează saturația agregată
      if (aggMarket.totalFound > 0) {
        aggMarket.saturationPct  = Math.round((aggMarket.withWebsite / aggMarket.totalFound) * 100)
        aggMarket.opportunityPct = 100 - aggMarket.saturationPct
        const sp = aggMarket.saturationPct
        aggMarket.verdict =
          sp<=20 ? {label:'Goldmine',emoji:'💎',color:'#4ade80',msg:`${aggMarket.opportunityPct}% fără site — concurență minimă, tu ești primul`}
          :sp<=40 ? {label:'Excelent',emoji:'🔥',color:'#f97316',msg:`${aggMarket.opportunityPct}% fără site — piață activă cu mulți clienți potențiali`}
          :sp<=60 ? {label:'Bun',     emoji:'⚡',color:'#eab308',msg:`${aggMarket.opportunityPct}% fără site — merită, există oportunitate`}
          :sp<=80 ? {label:'Mediu',   emoji:'👍',color:'#64748b',msg:`Doar ${aggMarket.opportunityPct}% fără site — piață parțial saturată`}
          :         {label:'Saturat', emoji:'❄️',color:'#ef4444',msg:`Doar ${aggMarket.opportunityPct}% fără site — schimbă categoria sau orașul`}
        setMarketData(aggMarket)
      }
      const updated = addLeads(all)
      setLeads(updated)
    } catch(e:unknown) { setSearchError(e instanceof Error ? e.message : String(e)) }
    finally { setSearching(false) }
  }

  async function generateAllMessages() {
    const targets = leads.filter(l=>!l.generated_whatsapp&&l.conversation_stage==='new')
    if (!targets.length||!settings.anthropicApiKey) return
    setGenProgress({done:0,total:targets.length})
    for (let i=0;i<targets.length;i++) {
      try {
        const res = await fetch('/api/generate-message',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ business:targets[i], mode:'whatsapp', variant:i%4, anthropicApiKey:settings.anthropicApiKey, senderName:settings.senderName, yourWebsite:settings.yourWebsite, yourPortfolio:settings.yourPortfolio, yourPhone:settings.yourPhone, priceFrom:settings.priceFrom, priceTo:settings.priceTo, deliveryDays:settings.deliveryDays }),
        })
        const data = await res.json()
        if (res.ok&&data.whatsapp) updateLead(targets[i].place_id,{generated_whatsapp:data.whatsapp,status:'ready'})
      } catch {}
      setGenProgress({done:i+1,total:targets.length})
      await new Promise(r=>setTimeout(r,700))
    }
    setLeads(getLeads())
    setGenProgress(null)
  }

  const filtered = leads.filter(l => {
    if (filter==='all')     return true
    if (filter==='hot')     return (l.conversion_score||0) >= 80
    if (filter==='found')   return l.conversation_stage==='new'||l.conversation_stage==='sent_opening'
    if (filter==='replied') return l.conversation_stage==='replied'||l.conversation_stage==='negotiating'
    if (filter==='demo')    return l.conversation_stage==='demo_sent'||l.demo_status==='ready'
    if (filter==='sent')    return l.status==='sent'
    if (filter==='won')     return l.conversation_stage==='closed_won'
    return true
  })

  const counts = {
    hot:     leads.filter(l=>(l.conversion_score||0)>=80).length,
    replied: leads.filter(l=>l.conversation_stage==='replied'||l.conversation_stage==='negotiating').length,
    won:     leads.filter(l=>l.conversation_stage==='closed_won').length,
    demo:    leads.filter(l=>l.demo_status==='ready').length,
    sent:    leads.filter(l=>l.status==='sent').length,
  }
  const notGenerated = leads.filter(l=>!l.generated_whatsapp&&l.conversation_stage==='new').length

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#060d1a 0%,#0b1628 60%,#060d1a 100%)' }}>
      {/* Header */}
      <header style={{ background:'rgba(6,13,26,0.95)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(99,179,237,0.08)', padding:'13px 16px', position:'sticky', top:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Link href="/" style={{ color:'#475569', fontSize:13, textDecoration:'none' }}>← Acasă</Link>
          <span style={{ color:'#1e293b' }}>/</span>
          <span style={{ fontWeight:800, color:'#f1f5f9', fontSize:15 }}>Leads</span>
          {counts.replied>0 && (
            <span style={{ background:'rgba(246,173,85,0.2)', color:'#f6ad55', border:'1px solid rgba(246,173,85,0.4)', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, animation:'pulse 2s infinite' }}>
              {counts.replied} răspuns{counts.replied>1?'uri':''}!
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#334155' }}><span style={{ color:'#63b3ed', fontWeight:700 }}>{leads.length}</span> leads</span>
          {leads.length>0 && <button onClick={()=>{if(confirm('Ștergi toate?')){clearLeads();setLeads([])}}} style={{ background:'rgba(252,129,129,0.08)', border:'1px solid rgba(252,129,129,0.2)', color:'#fc8181', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>🗑️</button>}
          <Link href="/settings" style={{ background:'rgba(99,179,237,0.1)', border:'1px solid rgba(99,179,237,0.2)', color:'#63b3ed', borderRadius:9, padding:'6px 12px', fontSize:12, fontWeight:700, textDecoration:'none' }}>⚙️ Setări</Link>
        </div>
      </header>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'16px 14px', display:'flex', gap:16, flexWrap:'wrap' }}>
        {/* Sidebar */}
        <div style={{ width:260, flexShrink:0 }}>
          {/* Search */}
          <div style={{ background:'rgba(13,22,41,0.85)', border:'1px solid rgba(99,179,237,0.12)', borderRadius:14, padding:16, marginBottom:12 }}>

            {/* Country switcher */}
            <div style={{ display:'flex', gap:4, marginBottom:14, background:'rgba(0,0,0,0.4)', borderRadius:10, padding:3 }}>
              <button onClick={()=>{ setCountry('ro'); setSearchMode('city'); setCity('Câmpia Turzii 🏘️') }}
                style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:800, fontSize:13,
                  background: country==='ro' ? 'linear-gradient(135deg,rgba(0,122,204,0.3),rgba(0,122,204,0.15))' : 'transparent',
                  color: country==='ro' ? '#63b3ed' : '#475569',
                  boxShadow: country==='ro' ? 'inset 0 0 0 1px rgba(99,179,237,0.3)' : 'none' }}>
                🇷🇴 România
              </button>
              <button onClick={()=>{ setCountry('hu'); setSearchMode('megye'); setMegye('Budapest') }}
                style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:800, fontSize:13,
                  background: country==='hu' ? 'linear-gradient(135deg,rgba(239,68,68,0.25),rgba(234,179,8,0.15))' : 'transparent',
                  color: country==='hu' ? '#fbbf24' : '#475569',
                  boxShadow: country==='hu' ? 'inset 0 0 0 1px rgba(251,191,36,0.3)' : 'none' }}>
                🇭🇺 Magyarország
              </button>
            </div>

            {/* Search mode tabs — Romania */}
            {country==='ro' && (
              <div style={{ display:'flex', gap:4, marginBottom:12, background:'rgba(0,0,0,0.3)', borderRadius:9, padding:3 }}>
                {(['city','judet'] as const).map(m=>(
                  <button key={m} onClick={()=>setSearchMode(m)}
                    style={{ flex:1, padding:'6px 0', borderRadius:7, border:'none', fontWeight:700, fontSize:11, cursor:'pointer',
                      background:searchMode===m?'rgba(99,179,237,0.2)':'transparent',
                      color:searchMode===m?'#63b3ed':'#475569' }}>
                    {m==='city'?'🏙️ Oraș':'🗺️ Județ'}
                  </button>
                ))}
              </div>
            )}

            {/* Search mode tabs — Hungary */}
            {country==='hu' && (
              <div style={{ display:'flex', gap:4, marginBottom:12, background:'rgba(0,0,0,0.3)', borderRadius:9, padding:3 }}>
                {(['megye','city'] as const).map(m=>(
                  <button key={m} onClick={()=>setSearchMode(m)}
                    style={{ flex:1, padding:'6px 0', borderRadius:7, border:'none', fontWeight:700, fontSize:11, cursor:'pointer',
                      background:searchMode===m?'rgba(251,191,36,0.2)':'transparent',
                      color:searchMode===m?'#fbbf24':'#475569' }}>
                    {m==='megye'?'🗺️ Megye':'🏙️ Város'}
                  </button>
                ))}
              </div>
            )}

            {/* Location selector */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:5 }}>
                {searchMode==='city'?(country==='hu'?'Város':'Oraș'):searchMode==='judet'?'Județ':'Megye'}
              </label>
              {searchMode==='megye'
                ? <select value={megye} onChange={e=>setMegye(e.target.value)}
                    style={{ width:'100%', background:'rgba(6,13,26,0.8)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
                    {Object.keys(MEGYEK).map(m=><option key={m} value={m}>{m} ({MEGYEK[m].length} város)</option>)}
                  </select>
                : searchMode==='city' && country==='hu'
                ? <select value={city} onChange={e=>setCity(e.target.value)}
                    style={{ width:'100%', background:'rgba(6,13,26,0.8)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
                    {HU_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                : searchMode==='city'
                ? <select value={city} onChange={e=>setCity(e.target.value)}
                    style={{ width:'100%', background:'rgba(6,13,26,0.8)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
                    {CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                : <select value={judet} onChange={e=>setJudet(e.target.value)}
                    style={{ width:'100%', background:'rgba(6,13,26,0.8)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
                    {Object.keys(JUDETE).map(j=><option key={j} value={j}>{j} ({JUDETE[j].length} orașe)</option>)}
                  </select>
              }
            </div>

            {/* Category */}
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:5 }}>
                {country==='hu'?'Kategória':'Categorie'}
              </label>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                style={{ width:'100%', background:'rgba(6,13,26,0.8)', border:`1px solid ${country==='hu'?'rgba(251,191,36,0.2)':'rgba(99,179,237,0.15)'}`, borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
                <optgroup label={country==='hu'?'⭐ Legjobb konverzió':'⭐ Conversie maximă'}>
                  {HIGH_CONVERSION_CATEGORIES.map(k=><option key={k} value={k}>{BUSINESS_CATEGORIES[k]}</option>)}
                </optgroup>
                <optgroup label={country==='hu'?'Összes kategória':'Toate'}>
                  {CATEGORIES.filter(([k])=>!HIGH_CONVERSION_CATEGORIES.includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </optgroup>
              </select>
            </div>

            {searchError && (
              <div style={{ background:'rgba(252,129,129,0.1)', border:'1px solid rgba(252,129,129,0.3)', color:'#fc8181', borderRadius:8, padding:'8px 11px', fontSize:12, marginBottom:10 }}>
                ⚠️ {searchError}
              </div>
            )}

            <button onClick={handleSearch} disabled={searching}
              style={{ width:'100%', padding:'11px', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13, opacity:searching?0.7:1,
                background: country==='hu'
                  ? 'linear-gradient(135deg,#ef4444,#b91c1c)'
                  : 'linear-gradient(135deg,#63b3ed,#3b82f6)',
                color:'#fff' }}>
              {searching
                ? (country==='hu'?'⏳ Keresés...':'⏳ Caut...')
                : (country==='hu'?'🔍 Weboldal nélküli vállalkozások':'🔍 Caută afaceri fără site')}
            </button>
          </div>

          {/* Market Intel — apare după search */}
          {marketData && (
            <div style={{ background:'rgba(13,22,41,0.95)', border:`1px solid ${marketData.verdict.color}40`, borderRadius:14, padding:16, marginBottom:12 }}>
              <div style={{ fontWeight:700, color:'#f1f5f9', fontSize:13, marginBottom:12 }}>
                📊 Market Intel
              </div>
              {/* Verdict principal */}
              <div style={{ background:`${marketData.verdict.color}15`, border:`1px solid ${marketData.verdict.color}40`, borderRadius:10, padding:12, marginBottom:12, textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:4 }}>{marketData.verdict.emoji}</div>
                <div style={{ fontSize:15, fontWeight:800, color:marketData.verdict.color, marginBottom:4 }}>{marketData.verdict.label}</div>
                <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.5 }}>{marketData.verdict.msg}</div>
              </div>
              {/* Bara saturație */}
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#475569', marginBottom:5 }}>
                  <span>Afaceri cu site</span>
                  <span style={{ fontWeight:700, color:'#94a3b8' }}>{marketData.saturationPct}%</span>
                </div>
                <div style={{ height:8, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${marketData.saturationPct}%`, background:'rgba(239,68,68,0.6)', borderRadius:4, transition:'width .6s ease' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#334155', marginTop:3 }}>
                  <span>0% = toți liberi</span>
                  <span>100% = toți au site</span>
                </div>
              </div>
              {/* Numerele exacte */}
              {[
                { l:'Afaceri găsite total', v:`${marketData.totalFound}`, c:'#94a3b8' },
                { l:'Au deja site', v:`${marketData.withWebsite}`, c:'#475569' },
                { l:'Fără site (clienți tăi)', v:`${marketData.withoutWebsite}`, c:marketData.verdict.color },
              ].map(r => (
                <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize:11, color:'#475569' }}>{r.l}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:r.c }}>{r.v}</span>
                </div>
              ))}
              {/* Sfat dinamic */}
              {marketData.saturationPct > 60 && (
                <div style={{ marginTop:10, padding:'8px 10px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, fontSize:11, color:'#fc8181', lineHeight:1.6 }}>
                  ⚠️ Piață saturată. Încearcă alt oraș sau categorie pentru rezultate mai bune.
                </div>
              )}
              {marketData.saturationPct <= 20 && (
                <div style={{ marginTop:10, padding:'8px 10px', background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)', borderRadius:8, fontSize:11, color:'#4ade80', lineHeight:1.6 }}>
                  💎 Goldmine! Ești primul freelancer care caută clienți aici. Trimite imediat!
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          {leads.length>0 && (
            <div style={{ background:'rgba(13,22,41,0.85)', border:'1px solid rgba(99,179,237,0.12)', borderRadius:14, padding:16, marginBottom:12 }}>
              <div style={{ fontWeight:700, color:'#f1f5f9', fontSize:13, marginBottom:12 }}>📊 Pipeline</div>
              {[
                {l:'Total leads',v:leads.length,c:'#63b3ed'},
                {l:'🔥 Hot leads (80+)',v:counts.hot,c:'#ef4444'},
                {l:'📱 Cu WhatsApp',v:leads.filter(l=>l.whatsapp_link).length,c:'#25D366'},
                {l:'📤 Mesaje trimise',v:counts.sent,c:'#63b3ed'},
                {l:'💬 Au răspuns',v:counts.replied,c:'#f6ad55'},
                {l:'🎨 Demo generat',v:counts.demo,c:'#f6ad55'},
                {l:'✅ Clienți câștigați',v:counts.won,c:'#4ade80'},
              ].map(s=>(
                <div key={s.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize:12, color:'#475569' }}>{s.l}</span>
                  <span style={{ fontWeight:800, fontSize:14, color:s.c }}>{s.v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Generate all */}
          {notGenerated>0 && settings.anthropicApiKey && (
            <div style={{ background:'rgba(13,22,41,0.85)', border:'1px solid rgba(37,211,102,0.2)', borderRadius:14, padding:16 }}>
              <div style={{ fontWeight:700, color:'#25D366', fontSize:13, marginBottom:8 }}>⚡ Generare masivă</div>
              <div style={{ fontSize:12, color:'#475569', marginBottom:12 }}>{notGenerated} leads fără mesaj</div>
              {genProgress && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:4 }}>
                    <span>Progres</span><span>{genProgress.done}/{genProgress.total}</span>
                  </div>
                  <div style={{ width:'100%', height:3, background:'rgba(37,211,102,0.1)', borderRadius:3 }}>
                    <div style={{ height:3, background:'linear-gradient(90deg,#25D366,#128C7E)', borderRadius:3, transition:'width .3s', width:`${(genProgress.done/genProgress.total)*100}%` }} />
                  </div>
                </div>
              )}
              <button onClick={generateAllMessages} disabled={genProgress!==null}
                style={{ width:'100%', padding:'10px', borderRadius:10, cursor:'pointer', background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.3)', color:'#25D366', fontWeight:700, fontSize:13, opacity:genProgress?0.6:1 }}>
                {genProgress?`⏳ ${genProgress.done}/${genProgress.total}...`:`⚡ Generează toate (${notGenerated})`}
              </button>
            </div>
          )}
        </div>

        {/* Main */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Filter tabs */}
          {leads.length>0 && (
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
              {([
                {k:'all',    l:`Toate (${leads.length})`},
                {k:'hot',    l:`🔥 Hot (${leads.filter(l=>(l.conversion_score||0)>=80).length})`, hot:true},
                {k:'found',  l:`Noi (${leads.filter(l=>l.conversation_stage==='new'||l.conversation_stage==='sent_opening').length})`},
                {k:'replied',l:`💬 Răspuns (${counts.replied})`, hot:counts.replied>0},
                {k:'demo',   l:`🎨 Demo (${counts.demo})`},
                {k:'won',    l:`✅ Câștigați (${counts.won})`},
              ] as {k:string,l:string,hot?:boolean}[]).map(f=>(
                <button key={f.k} onClick={()=>setFilter(f.k as typeof filter)}
                  style={{ padding:'6px 12px', borderRadius:20, fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap',
                    background: filter===f.k
                      ? f.k==='hot' ? 'rgba(239,68,68,0.25)' : f.hot ? 'rgba(246,173,85,0.25)' : 'rgba(99,179,237,0.2)'
                      : 'rgba(255,255,255,0.04)',
                    color: filter===f.k
                      ? f.k==='hot' ? '#ef4444' : f.hot ? '#f6ad55' : '#63b3ed'
                      : f.k==='hot' ? '#ef444488' : '#475569',
                    boxShadow: f.k==='hot'&&filter!==f.k ? '0 0 12px rgba(239,68,68,0.2)' : f.hot&&filter!==f.k ? '0 0 10px rgba(246,173,85,0.2)' : 'none',
                    border: f.k==='hot' ? '1px solid rgba(239,68,68,0.3)' : f.hot&&filter!==f.k ? '1px solid rgba(246,173,85,0.3)' : '1px solid transparent' }}>
                  {f.l}
                </button>
              ))}
            </div>
          )}
          {/* Scor info */}
          {leads.length>0 && (
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#334155', fontWeight:600 }}>Scor conversie:</span>
              {[{e:'🔥',l:'Hot 80+',c:'#ef4444'},{e:'⚡',l:'Warm 65+',c:'#f97316'},{e:'👍',l:'Maybe 45+',c:'#eab308'},{e:'❄️',l:'Cold',c:'#64748b'}].map(s=>(
                <span key={s.l} style={{ fontSize:11, color:s.c, fontWeight:600 }}>{s.e} {s.l}</span>
              ))}
              <span style={{ fontSize:11, color:'#1e293b' }}>· sortat automat</span>
            </div>
          )}

          {/* Empty */}
          {leads.length===0 && (
            <div style={{ textAlign:'center', paddingTop:60 }}>
              <div style={{ fontSize:56, marginBottom:14 }}>🎯</div>
              <div style={{ fontWeight:800, color:'#f1f5f9', fontSize:20, marginBottom:8 }}>Zero leads momentan</div>
              <div style={{ color:'#475569', fontSize:14, marginBottom:24, lineHeight:1.7 }}>
                Selectează un oraș sau județ + categorie<br/>și apasă Caută afaceri fără site
              </div>
              <div style={{ background:'rgba(13,22,41,0.85)', border:'1px solid rgba(99,179,237,0.12)', borderRadius:14, padding:18, maxWidth:280, margin:'0 auto', textAlign:'left' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:10 }}>💡 Cel mai bun start azi:</div>
                <div style={{ fontSize:13, color:'#64748b', lineHeight:2 }}>
                  🏘️ <strong style={{ color:'#e2e8f0' }}>Județ Cluj</strong> → toate orașele mici<br/>
                  💄 Categorie: <strong style={{ color:'#e2e8f0' }}>Salon Înfrumusețare</strong><br/>
                  🥐 Sau: <strong style={{ color:'#e2e8f0' }}>Brutărie</strong> (sezon Paști!)
                </div>
              </div>
            </div>
          )}

          {/* Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
            {filtered.map(b=>(
              <LeadCard key={b.place_id} biz={b} settings={settings} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
    </div>
  )
}
