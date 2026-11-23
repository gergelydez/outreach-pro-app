// Căutare pe o zonă întreagă (un județ sau un oraș, toate meseriile sau una): toate firmele FĂRĂ site,
// cu număr de mobil (pentru WhatsApp). Pașii se fac unul câte unul, ca fiecare cerere să rămână scurtă.
import { runDiscovery } from './discovery'
import { runPendingAudits } from './audit-runner'
import { citiesFor, huntOrder, categoriesFor, type Country } from './countries'

export interface AreaPlan { cities: { city: string; region: string }[]; categories: string[]; total: number }

export function areaPlan(country: Country, region: string, city?: string | null, category?: string | null): AreaPlan {
  const inRegion = citiesFor(country).filter(c => c.region === region)
  const cities = city ? inRegion.filter(c => c.city === city) : inRegion
  const known = categoriesFor(country).map(c => c.key)
  const categories = category && category !== 'all' ? (known.includes(category) ? [category] : []) : huntOrder(country)
  return { cities, categories, total: cities.length * categories.length }
}

// pasul i: întâi toate meseriile dintr-un oraș, apoi orașul următor
export function areaStepAt(plan: AreaPlan, i: number) {
  if (i < 0 || i >= plan.total) return null
  const c = plan.cities[Math.floor(i / plan.categories.length)]
  return { city: c.city, region: c.region, category: plan.categories[i % plan.categories.length] }
}

export async function areaStep(opts: { country: Country; region: string; city?: string | null; category?: string | null; cursor: number; apiKey?: string | null; budgetMs?: number; fetchImpl?: typeof fetch }) {
  const started = Date.now()
  const budget = opts.budgetMs ?? 45_000
  const plan = areaPlan(opts.country, opts.region, opts.city, opts.category)
  const step = areaStepAt(plan, opts.cursor)
  if (!step) return { cursor: opts.cursor, total: plan.total, done: true as const }
  const res = await runDiscovery({ ...step, limit: 60, minRating: null, minReviews: null, mobileOnly: true, websiteFilter: 'no_real_website', country: opts.country }, opts.fetchImpl, { apiKey: opts.apiKey })
  // firmele găsite au deja telefonul și linkul (dacă au); auditul le confirmă statutul „fără site”
  while (Date.now() - started < budget - 15_000) {
    const r = await runPendingAudits(8)
    if (!r.remaining || !r.processed.length) break
  }
  const cursor = opts.cursor + 1
  return {
    cursor, total: plan.total, done: cursor >= plan.total,
    ran: { ...step, found: res.found, newCount: res.newCount },
    stoppedReason: res.stoppedReason, error: res.error,
  }
}
