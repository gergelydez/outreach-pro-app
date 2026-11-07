'use client'

// Prospectare: listă mare (tot județul), validată ÎNAINTE să faci vreun site —
// telefon mobil/fix, WhatsApp verificat manual, site chiar inexistent sau vechi.
// Doar cele validate merg mai departe în Rebuild.

import type { RebuildLead } from './rebuild'
import type { PhoneType } from './phone'

export interface Prospect extends RebuildLead {
  phone_type: PhoneType
  wa_status: 'unknown' | 'yes' | 'no'          // marcat de tine după ce deschizi chatul
  site_check?: {
    status: 'possible' | 'none_found' | 'confirmed_none' | 'has_site'
    found: { url: string; title: string }[]
    checked_at: string
  }
  sent_to_rebuild?: boolean
}

const KEY = 'prospect_list'

export function getProspects(): Prospect[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function saveProspects(list: Prospect[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch {}
}

export function updateProspect(id: string, u: Partial<Prospect>): Prospect[] {
  const list = getProspects().map(p => p.place_id === id ? { ...p, ...u } : p)
  saveProspects(list)
  return list
}
