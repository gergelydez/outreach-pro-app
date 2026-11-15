// Vânătoarea zilnică: caută singură (oraș cu oraș, meserie cu meserie) până când „lista zilei”
// are 50 de firme bune — fără site sau cu site de refăcut, cu număr de mobil (pot avea WhatsApp),
// nemarcate „nu are WhatsApp” și încă necontactate. Câte o listă pentru UK și pentru Ungaria.
// Întâi categoriile care plătesc cel mai probabil acum (vezi countries.ts → huntOrder), și doar
// afaceri active (rating ≥ 4, câteva recenzii). Fiecare pas e scurt, ca să încapă într-o cerere Vercel.
import { q, one } from './db'
import { getSettings } from './settings'
import { runDiscovery } from './discovery'
import { runPendingAudits } from './audit-runner'
import { DEMO_STATUSES } from './uk-templates'
import { logActivity } from './activity'
import { categoriesFor, citiesFor, huntOrder, type Country } from './countries'

// Rotația pe niveluri: primele 10 categorii (cele care plătesc) în toate orașele, apoi următoarele 10…
const TIER = 10
export function rotation(cursor: number, country: Country = 'UK', month = new Date().getMonth()) {
  const cats = huntOrder(country, month)
  const cities = citiesFor(country)
  const total = cats.length * cities.length
  let i = ((cursor % total) + total) % total
  for (let t = 0; t < cats.length; t += TIER) {
    const tier = cats.slice(t, t + TIER)
    const size = tier.length * cities.length
    if (i < size) return { category: tier[i % tier.length], ...cities[Math.floor(i / tier.length)] }
    i -= size
  }
  return { category: cats[0], ...cities[0] }
}
export const HUNT_CATEGORIES = huntOrder('UK')
export const HUNT_CITIES = citiesFor('UK')

const MOBILE_SQL: Record<Country, string> = {
  UK: `b.phone_e164 ~ '^\\+447[0-9]{9}$'`,
  HU: `b.phone_e164 ~ '^\\+36(20|30|31|50|70)[0-9]{7}$'`,
}

// „Lista zilei”: firmele bune de contactat acum, într-o țară
export function poolWhere(country: Country = 'UK'): string {
  return `b.country = '${country}'
  AND b.website_status = ANY('{${DEMO_STATUSES.join(',')}}'::text[])
  AND ${MOBILE_SQL[country]}
  AND NOT (b.whatsapp_status = 'NOT_FOUND' AND coalesce(b.whatsapp_source, '') = 'manual')
  AND b.stage IN ('new_lead', 'reviewed', 'ready_to_contact')`
}
export const POOL_WHERE = poolWhere('UK')

export async function poolCount(country: Country = 'UK'): Promise<number> {
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM businesses b WHERE ${poolWhere(country)}`)
  return Number(r?.n || 0)
}

export interface HuntState { cursor: number; day: string; steps_today: number; new_today: number; last_run_at?: string; last_auto_at?: string; last_auto_added?: number; log: string[] }
const today = () => new Date().toISOString().slice(0, 10)
const stateKey = (country: Country) => (country === 'UK' ? 'hunt' : `hunt_${country}`)

export async function getHuntState(country: Country = 'UK'): Promise<HuntState> {
  const r = await one<{ value: HuntState }>(`SELECT value FROM app_settings WHERE key = $1`, [stateKey(country)])
  const s: HuntState = { cursor: 0, day: today(), steps_today: 0, new_today: 0, log: [], ...(r?.value || {}) }
  if (s.day !== today()) { s.day = today(); s.steps_today = 0; s.new_today = 0; s.log = []; s.last_auto_added = 0 }
  return s
}
async function saveHuntState(s: HuntState, country: Country) {
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [stateKey(country), JSON.stringify(s)])
}

export interface HuntStepResult {
  pool: number; target: number; done: boolean; stoppedReason?: 'target_reached' | 'daily_limit' | 'step_limit' | 'error'
  ran?: { city: string; category: string; found: number; newCount: number }
  pendingAudits: number; error?: string; log: string[]; country: Country
}

export const MAX_STEPS_PER_DAY = 80
// „afacere activă, care încasează”: rating bun și câteva recenzii
export const HUNT_FILTERS = { minRating: 4.0, minReviews: 5 }

export async function huntStep(opts: { country?: Country; apiKey?: string | null; budgetMs?: number; fetchImpl?: typeof fetch; siteFetch?: typeof fetch; allowPrivate?: boolean; auto?: boolean } = {}): Promise<HuntStepResult> {
  const country: Country = opts.country || 'UK'
  const started = Date.now()
  const budget = opts.budgetMs ?? 45_000
  const timeLeft = () => budget - (Date.now() - started)
  const settings = await getSettings()
  const target = settings.target_market.daily_target || 50
  const state = await getHuntState(country)
  const audit = async () => {
    let remaining = 0
    while (timeLeft() > 15_000) {
      const r = await runPendingAudits(8, { fetchImpl: opts.siteFetch, allowPrivate: opts.allowPrivate })
      remaining = r.remaining
      if (!r.remaining || !r.processed.length) break
    }
    return remaining
  }

  // 1) întâi terminăm auditurile rămase (ele decid dacă o firmă intră în listă)
  let pending = await audit()
  let pool = await poolCount(country)
  const finish = async (extra: Partial<HuntStepResult>): Promise<HuntStepResult> => {
    state.last_run_at = new Date().toISOString()
    if (opts.auto) state.last_auto_at = state.last_run_at
    await saveHuntState(state, country)
    return { pool, target, done: pool >= target, pendingAudits: pending, log: state.log.slice(-12), country, ...extra }
  }
  if (pool >= target) return finish({ stoppedReason: 'target_reached' })
  if (state.steps_today >= MAX_STEPS_PER_DAY) return finish({ stoppedReason: 'step_limit' })

  // 2) o căutare nouă: următorul oraș × meserie din rotație
  const { city, region, category } = rotation(state.cursor, country)
  const res = await runDiscovery({ city, region, category, limit: 60, ...HUNT_FILTERS, mobileOnly: true, country }, opts.fetchImpl, { apiKey: opts.apiKey })
  state.cursor++
  state.steps_today++
  state.new_today += res.newCount
  const label = categoriesFor(country).find(c => c.key === category)?.label || category
  state.log.push(`${label} · ${city}: ${res.found} găsite, ${res.newCount} noi cu mobil${res.error ? ` (eroare: ${res.error})` : ''}`)
  if (opts.auto) state.last_auto_added = (state.last_auto_added || 0) + res.newCount

  // 3) auditul firmelor noi
  pending = await audit()
  pool = await poolCount(country)
  const ran = { city, category, found: res.found, newCount: res.newCount }
  if (res.stoppedReason === 'error') {
    // cheie lipsă / respinsă: nu are rost să continuăm
    if (/key|REQUEST_DENIED|403|billing/i.test(res.error || '')) return finish({ ran, stoppedReason: 'error', error: res.error })
  }
  if (res.stoppedReason === 'daily_limit') {
    await logActivity(null, 'hunt', `Daily hunt stopped at the daily limit of new businesses (${settings.limits.daily_discovery_max})`)
    return finish({ ran, stoppedReason: 'daily_limit' })
  }
  return finish({ ran, stoppedReason: pool >= target ? 'target_reached' : undefined })
}
