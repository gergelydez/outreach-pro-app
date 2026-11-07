'use client'

// Piese comune pentru paginile Rebuild și Prospectare: culori, butoane, scoruri, linkuri.
import { CITY_COORDINATES, BUSINESS_CATEGORIES } from '@/lib/constants'
import type { RebuildLead } from '@/lib/rebuild'
import type { Settings } from '@/lib/types'
import { seasonEntries } from '@/lib/season'

export const CITIES = Object.keys(CITY_COORDINATES).sort()

// Categorii unde un site bun aduce bani și clientul își permite să plătească
export const PRIORITY = ['dentist', 'lawyer', 'doctor', 'physiotherapist', 'veterinary_care', 'accounting',
  'real_estate_agency', 'lodging', 'car_dealer', 'car_repair', 'auto_body', 'restaurant', 'spa', 'gym', 'beauty_salon']
// În sezon (🔥) primele, apoi categoriile cu bilet mare (💰), apoi restul
export function categoryOptions(): (readonly [string, string])[] {
  const hot = Array.from(new Set(seasonEntries().flatMap(e => e.categories))).filter(k => BUSINESS_CATEGORIES[k])
  return [
    ...hot.map(k => [k, `🔥 ${BUSINESS_CATEGORIES[k]}`] as const),
    ...PRIORITY.filter(k => BUSINESS_CATEGORIES[k] && !hot.includes(k)).map(k => [k, `💰 ${BUSINESS_CATEGORIES[k]}`] as const),
    ...Object.entries(BUSINESS_CATEGORIES).filter(([k]) => !PRIORITY.includes(k) && !hot.includes(k)),
  ]
}

// Textul ofertei din Setări, sau '' dacă nu e configurată
export function promoText(s: Settings): string {
  if (!s.promoLabel || !s.promoPrice) return ''
  return `${s.promoLabel}: ${s.promoPrice} lei${s.promoRegularPrice ? ` în loc de ${s.promoRegularPrice} lei` : ''}${s.promoUntil ? `, până pe ${s.promoUntil}` : ''}`
}

export const C = { bg: 'rgba(15,22,41,0.8)', border: 'rgba(99,179,237,0.15)', muted: '#94a3b8', dim: '#64748b',
  wa: '#25D366', blue: '#63b3ed', amber: '#f6ad55', violet: '#a78bfa', red: '#fc8181', green: '#4ade80', cyan: '#22d3ee' }

export function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20,
    fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>{children}</span>
}

export function Btn({ onClick, children, color = C.blue, disabled = false, solid = false, small = false, title }:
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

export function Bar({ value, color }: { value: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden', flex: 1 }}>
    <div style={{ width: `${value}%`, height: '100%', background: color }} /></div>
}

// „acum 3 zile” / „acum 2 săptămâni” / „acum 4 luni”
export function ago(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5))
  if (days === 0) return 'azi'
  if (days < 14) return `acum ${days} ${days === 1 ? 'zi' : 'zile'}`
  if (days < 60) return `acum ${Math.round(days / 7)} săptămâni`
  return `acum ${Math.round(days / 30)} luni`
}

// Google Maps: linkul oficial din Places; pentru lead-uri mai vechi, căutare după place_id
export function mapsUrl(l: RebuildLead) {
  return l.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name)}&query_place_id=${l.place_id}`
}

export function socialLabel(url: string) {
  const h = url.toLowerCase()
  if (h.includes('facebook.com')) return '📘 Facebook'
  if (h.includes('instagram.com')) return '📷 Instagram'
  if (h.includes('tiktok.com')) return '🎵 TikTok'
  if (h.includes('youtube.com')) return '▶️ YouTube'
  if (h.includes('linkedin.com')) return '💼 LinkedIn'
  return '🔗 ' + url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
}

// Linkuri reale (Maps + social media găsite) și, la cei fără site, căutări rapide
export function LeadLinks({ l }: { l: RebuildLead }) {
  const socials = l.audit?.socials || []
  const q = encodeURIComponent(`${l.name} ${l.city.replace(' 🏘️', '')}`)
  const link = { color: C.blue, textDecoration: 'none', whiteSpace: 'nowrap' as const }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, marginTop: 4 }}>
      <a href={mapsUrl(l)} target="_blank" rel="noreferrer" style={link}>🗺️ Google Maps</a>
      {socials.map(s => <a key={s} href={s} target="_blank" rel="noreferrer" style={link}>{socialLabel(s)}</a>)}
      {l.no_site && !socials.some(s => s.includes('facebook.com')) &&
        <a href={`https://www.facebook.com/search/pages?q=${q}`} target="_blank" rel="noreferrer" style={{ ...link, color: C.dim }}>🔎 caută pe Facebook</a>}
      {l.no_site && !socials.some(s => s.includes('instagram.com')) &&
        <a href={`https://www.google.com/search?q=${q}+instagram`} target="_blank" rel="noreferrer" style={{ ...link, color: C.dim }}>🔎 caută Instagram</a>}
    </div>
  )
}

export function elapsed(since: string) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

// Explicație pe înțeles a celor două scoruri, pentru decizia „merită sau nu”
export function verdict(outdated: number, revenue: number, noSite = false): string {
  const pays = revenue >= 60, old = outdated >= 50, some = outdated >= 25
  if (noSite) return pays
    ? '🎯 Țintă foarte bună: afacerea are clienți (multe recenzii), dar nu are site propriu. Conceptul va fi primul lor site.'
    : '⚠️ Nu are site, dar afacerea pare mică (puține recenzii). Riști să nu-și permită. Încearcă dacă nu ai ținte mai bune.'
  if (pays && old) return '🎯 Țintă foarte bună: afacerea merge bine, iar site-ul are probleme clare. Merită un redesign.'
  if (pays && some) return '👍 Afacere bună, site-ul are câteva probleme tehnice, dar nu e dezastru. Merită dacă vizual arată vechi; deschide site-ul și judecă tu.'
  if (pays) return '🤔 Afacere bună, dar site-ul actual e în regulă tehnic. Merită doar dacă designul arată clar învechit.'
  if (old) return '⚠️ Site-ul are probleme, dar afacerea pare mică (puține recenzii). Riști să nu-și permită. Încearcă doar dacă nu ai ținte mai bune.'
  return '⏭️ Prioritate mică: afacere mică și site acceptabil.'
}

export function scoreColor(v: number) { return v >= 70 ? C.red : v >= 45 ? C.amber : v >= 25 ? '#eab308' : C.dim }

export function fieldStyle(): React.CSSProperties {
  return { width: '100%', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#f1f5f9',
    background: C.bg, border: `1px solid ${C.border}`, outline: 'none' }
}
