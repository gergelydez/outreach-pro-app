'use client'

import type { Business, Settings, DailyStats } from './types'

const LEADS_KEY    = 'biz_leads'
const SETTINGS_KEY = 'biz_settings'
const STATS_KEY    = 'biz_stats'

export function getLeads(): Business[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LEADS_KEY) || '[]') }
  catch { return [] }
}

export function saveLeads(leads: Business[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
}

export function addLeads(newLeads: Business[]): Business[] {
  const existing = getLeads()
  const existingIds = new Set(existing.map(l => l.place_id))
  const merged = [...existing, ...newLeads.filter(l => !existingIds.has(l.place_id))]
  saveLeads(merged)
  return merged
}

export function updateLead(placeId: string, updates: Partial<Business>): void {
  const leads = getLeads()
  const idx = leads.findIndex(l => l.place_id === placeId)
  if (idx !== -1) {
    leads[idx] = { ...leads[idx], ...updates }
    saveLeads(leads)
  }
}

export function deleteLead(placeId: string): void {
  saveLeads(getLeads().filter(l => l.place_id !== placeId))
}

export function clearLeads(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LEADS_KEY)
}

export const DEFAULT_SETTINGS: Settings = {
  googlePlacesApiKey: '',
  anthropicApiKey:    '',
  senderEmail:        '',
  senderAppPassword:  '',
  senderName:         '',
  yourWebsite:        '',
  yourPortfolio:      '',
  yourPhone:          '',
  priceFrom:          '500',
  priceTo:            '1500',
  deliveryDays:       '5',
  maxEmailsPerDay:    150,
}

export function getSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...DEFAULT_SETTINGS, ...stored }
  } catch { return DEFAULT_SETTINGS }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function getTodayStats(): DailyStats {
  if (typeof window === 'undefined') return { date: '', sent: 0, failed: 0 }
  const today = new Date().toISOString().split('T')[0]
  try {
    const all: DailyStats[] = JSON.parse(localStorage.getItem(STATS_KEY) || '[]')
    return all.find(s => s.date === today) || { date: today, sent: 0, failed: 0 }
  } catch { return { date: today, sent: 0, failed: 0 } }
}

export function incrementTodaySent(success: boolean): void {
  if (typeof window === 'undefined') return
  const today = new Date().toISOString().split('T')[0]
  try {
    const all: DailyStats[] = JSON.parse(localStorage.getItem(STATS_KEY) || '[]')
    const idx = all.findIndex(s => s.date === today)
    if (idx !== -1) { if (success) all[idx].sent++; else all[idx].failed++ }
    else all.push({ date: today, sent: success ? 1 : 0, failed: success ? 0 : 1 })
    localStorage.setItem(STATS_KEY, JSON.stringify(all))
  } catch {}
}

export function getAllStats(): DailyStats[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '[]') }
  catch { return [] }
}
