'use client'

// Fluxul "Rebuild Their Site": afaceri CU site vechi → audit → demo redesign
// pe link live → mesaj personal, trimis manual, în număr mic.

export interface SiteAudit {
  url: string
  final_url: string
  reachable: boolean
  https: boolean
  mobile_friendly: boolean
  load_ms: number
  html_kb: number
  copyright_year: number | null
  outdated_score: number        // 0-100, cât de vechi/stricat arată site-ul
  issues: string[]              // probleme concrete, în română, pentru mesaj
  // conținut real extras — folosit pentru redesign
  title: string
  description: string
  headings: string[]
  text_excerpt: string
  emails: string[]
  phones: string[]
  socials: string[]
  logo_url: string
  images: string[]
  audited_at: string
}

export type RebuildStage =
  | 'found'        // găsit pe Maps
  | 'audited'      // site analizat
  | 'shortlisted'  // ales pentru demo
  | 'demo_ready'   // redesign generat
  | 'published'    // preview live
  | 'contacted'    // mesaj trimis (manual)
  | 'replied'
  | 'won'
  | 'lost'
  | 'skipped'

export interface RebuildLead {
  place_id: string
  name: string
  address: string
  city: string
  category: string
  category_label: string
  phone: string
  phone_intl: string
  website: string
  rating: number
  reviews_count: number
  revenue_score: number         // 0-100, semnale că afacerea face bani
  audit?: SiteAudit
  opportunity_score: number     // combinat: site vechi × afacere care plătește
  demo_html: string
  preview_url: string
  contact_email: string
  message: string
  email_subject: string
  stage: RebuildStage
  notes: string
  contacted_at?: string
  contact_channel?: 'whatsapp' | 'email' | 'form' | 'phone' | 'dm'
  created_at: string
}

const KEY = 'rebuild_leads'
const CONTACT_LOG_KEY = 'rebuild_contact_log'

export function getRebuildLeads(): RebuildLead[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') }
  catch { return [] }
}

export function saveRebuildLeads(leads: RebuildLead[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify(leads)) }
  catch {
    // localStorage plin (demo-urile HTML sunt mari) — păstrăm demo-ul doar la cele publicate/active
    const slim = leads.map(l =>
      ['shortlisted', 'demo_ready', 'published'].includes(l.stage) ? l : { ...l, demo_html: '' })
    localStorage.setItem(KEY, JSON.stringify(slim))
  }
}

export function addRebuildLeads(newLeads: RebuildLead[]): RebuildLead[] {
  const existing = getRebuildLeads()
  const ids = new Set(existing.map(l => l.place_id))
  const merged = [...existing, ...newLeads.filter(l => !ids.has(l.place_id))]
  saveRebuildLeads(merged)
  return merged
}

export function updateRebuildLead(placeId: string, updates: Partial<RebuildLead>): RebuildLead[] {
  const leads = getRebuildLeads()
  const idx = leads.findIndex(l => l.place_id === placeId)
  if (idx !== -1) {
    leads[idx] = { ...leads[idx], ...updates }
    if (updates.audit) leads[idx].opportunity_score = opportunityScore(leads[idx])
    saveRebuildLeads(leads)
  }
  return leads
}

export function deleteRebuildLead(placeId: string): RebuildLead[] {
  const leads = getRebuildLeads().filter(l => l.place_id !== placeId)
  saveRebuildLeads(leads)
  return leads
}

// Site vechi contează 60%, afacere care plătește 40%.
// Un site nefuncțional la o afacere fără recenzii nu e o oportunitate.
export function opportunityScore(l: Pick<RebuildLead, 'revenue_score' | 'audit'>): number {
  if (!l.audit) return Math.round(l.revenue_score * 0.4)
  return Math.round(l.audit.outdated_score * 0.6 + l.revenue_score * 0.4)
}

// ── Limită zilnică de contactări — outreach personal, nu spam ────────────────
function today() { return new Date().toISOString().split('T')[0] }

export function getContactsToday(): number {
  if (typeof window === 'undefined') return 0
  try {
    const log: Record<string, number> = JSON.parse(localStorage.getItem(CONTACT_LOG_KEY) || '{}')
    return log[today()] || 0
  } catch { return 0 }
}

export function logContact(): void {
  if (typeof window === 'undefined') return
  try {
    const log: Record<string, number> = JSON.parse(localStorage.getItem(CONTACT_LOG_KEY) || '{}')
    log[today()] = (log[today()] || 0) + 1
    localStorage.setItem(CONTACT_LOG_KEY, JSON.stringify(log))
  } catch {}
}

export const STAGE_INFO: Record<RebuildStage, { emoji: string; label: string; color: string }> = {
  found:       { emoji: '🔍', label: 'Găsit',        color: '#64748b' },
  audited:     { emoji: '🩺', label: 'Auditat',      color: '#63b3ed' },
  shortlisted: { emoji: '⭐', label: 'Ales',         color: '#f6ad55' },
  demo_ready:  { emoji: '🎨', label: 'Demo gata',    color: '#a78bfa' },
  published:   { emoji: '🔗', label: 'Preview live', color: '#22d3ee' },
  contacted:   { emoji: '📤', label: 'Contactat',    color: '#25D366' },
  replied:     { emoji: '💬', label: 'A răspuns',    color: '#4ade80' },
  won:         { emoji: '✅', label: 'Client!',      color: '#4ade80' },
  lost:        { emoji: '❌', label: 'Pierdut',      color: '#fc8181' },
  skipped:     { emoji: '⏭️', label: 'Sărit',        color: '#475569' },
}
