// Setările CRM: valori implicite + citire/scriere în app_settings.
import { q } from './db'

export interface ScoringWeights {
  no_website: number
  social_only: number
  directory_or_free: number
  broken_website: number
  outdated_website: number
  needs_redesign: number
  poor_mobile: number
  poor_pagespeed: number
  missing_contact_form: number
  missing_cta: number
  no_whatsapp_link: number
  established_reviews: number
  strong_reputation: number
}

export interface ServiceItem { key: string; label: string; price: number; recurring?: 'monthly' | null }

export interface CrmSettings {
  business_profile: { company_name: string; business_email: string; website: string; sender_name: string; country: string; currency: string; default_offer: string }
  target_market: { country: string; region: string; cities: string[]; categories: string[]; daily_target: number }
  limits: { daily_discovery_max: number; max_per_run: number; ai_requests_per_hour: number }
  scoring: ScoringWeights
  services: ServiceItem[]
  outreach: { language: string; tone: string; follow_up_days: number[]; signature: string }
}

export const DEFAULT_SETTINGS: CrmSettings = {
  business_profile: { company_name: '', business_email: '', website: '', sender_name: '', country: 'United Kingdom', currency: 'GBP', default_offer: 'Professional website from £299' },
  target_market: { country: 'United Kingdom', region: 'West Midlands', cities: ['Birmingham', 'Wolverhampton'], categories: ['plumber', 'electrician'], daily_target: 50 },
  limits: { daily_discovery_max: 150, max_per_run: 60, ai_requests_per_hour: 60 },
  scoring: {
    no_website: 25, social_only: 20, directory_or_free: 18, broken_website: 20, outdated_website: 15, needs_redesign: 12,
    poor_mobile: 10, poor_pagespeed: 10, missing_contact_form: 5, missing_cta: 5, no_whatsapp_link: 3,
    established_reviews: 5, strong_reputation: 5,
  },
  services: [
    { key: 'basic_site', label: 'Basic Business Website', price: 299 },
    { key: 'pro_site', label: 'Professional Website', price: 499 },
    { key: 'premium_site', label: 'Premium Website', price: 799 },
    { key: 'local_seo', label: 'Local SEO Setup', price: 149 },
    { key: 'gbp', label: 'Google Business Profile Optimisation', price: 99 },
    { key: 'speed', label: 'Website Speed Optimisation', price: 149 },
    { key: 'maintenance', label: 'Website Maintenance', price: 49, recurring: 'monthly' },
  ],
  outreach: { language: 'en-GB', tone: 'friendly, professional, low-pressure British English', follow_up_days: [3, 7, 14], signature: '' },
}

export type SettingsKey = keyof CrmSettings

export async function getSettings(): Promise<CrmSettings> {
  const rows = await q<{ key: string; value: unknown }>('SELECT key, value FROM app_settings')
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>
  for (const r of rows) {
    if (r.key in out && r.value && typeof r.value === 'object') {
      const def = out[r.key]
      out[r.key] = Array.isArray(def) ? r.value : { ...(def as object), ...(r.value as object) }
    }
  }
  return out as unknown as CrmSettings
}

export async function saveSetting<K extends SettingsKey>(key: K, value: CrmSettings[K]) {
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)])
}
