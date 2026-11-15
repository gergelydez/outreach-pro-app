// Vânătoarea zilnică: caută singură prin UK (oraș cu oraș, meserie cu meserie) până când
// „lista zilei” are 50 de firme bune — fără site sau cu site de refăcut, cu număr de mobil
// (pot avea WhatsApp), nemarcate „nu are WhatsApp” și încă necontactate.
// Fiecare pas e scurt (o căutare + auditurile ei), ca să încapă într-o cerere Vercel.
import { q, one } from './db'
import { getSettings } from './settings'
import { runDiscovery } from './discovery'
import { runPendingAudits } from './audit-runner'
import { UK_CATEGORIES, UK_REGIONS } from './constants'
import { DEMO_STATUSES } from './uk-templates'
import { logActivity } from './activity'

// Ordinea meseriilor: întâi cele unde multe firme n-au site (frizerii, unghii, spălătorii…)
const CATEGORY_ORDER = ['barber', 'nail_salon', 'car_wash', 'mobile_mechanic', 'handyman', 'window_cleaner', 'cleaning', 'gardener', 'dog_groomer', 'lash_brow',
  'takeaway', 'tyres', 'removals', 'beauty_salon', 'hairdresser', 'massage', 'tattoo', 'plasterer', 'tiler', 'painter_decorator', 'fencing', 'driveways',
  'tree_surgeon', 'carpet_cleaning', 'phone_repair', 'tailor', 'caterer', 'personal_trainer', 'driving_instructor', 'body_shop', 'car_repair', 'carpenter',
  'roofer', 'builder', 'plumber', 'electrician', 'heating_engineer', 'locksmith', 'landscaping', 'pest_control', 'scaffolding', 'cafe', 'bakery', 'florist',
  'computer_repair', 'photographer', 'tutor']
export const HUNT_CATEGORIES = [...CATEGORY_ORDER.filter(k => UK_CATEGORIES.some(c => c.key === k)), ...UK_CATEGORIES.map(c => c.key).filter(k => !CATEGORY_ORDER.includes(k))]
export const HUNT_CITIES = Object.entries(UK_REGIONS).flatMap(([region, cities]) => cities.map(city => ({ city, region })))

export function rotation(cursor: number) {
  const n = HUNT_CATEGORIES.length
  const i = ((cursor % (n * HUNT_CITIES.length)) + n * HUNT_CITIES.length) % (n * HUNT_CITIES.length)
  return { category: HUNT_CATEGORIES[i % n], ...HUNT_CITIES[Math.floor(i / n)] }
}

// „Lista zilei”: firmele bune de contactat acum
export const POOL_WHERE = `b.website_status = ANY('{${DEMO_STATUSES.join(',')}}'::text[])
  AND b.phone_e164 LIKE '+447%'
  AND NOT (b.whatsapp_status = 'NOT_FOUND' AND coalesce(b.whatsapp_source, '') = 'manual')
  AND b.stage IN ('new_lead', 'reviewed', 'ready_to_contact')`

export async function poolCount(): Promise<number> {
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM businesses b WHERE ${POOL_WHERE}`)
  return Number(r?.n || 0)
}

export interface HuntState { cursor: number; day: string; steps_today: number; new_today: number; last_run_at?: string; last_auto_at?: string; last_auto_added?: number; log: string[] }
const today = () => new Date().toISOString().slice(0, 10)

export async function getHuntState(): Promise<HuntState> {
  const r = await one<{ value: HuntState }>(`SELECT value FROM app_settings WHERE key = 'hunt'`)
  const s: HuntState = { cursor: 0, day: today(), steps_today: 0, new_today: 0, log: [], ...(r?.value || {}) }
  if (s.day !== today()) { s.day = today(); s.steps_today = 0; s.new_today = 0; s.log = [] }
  return s
}
async function saveHuntState(s: HuntState) {
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ('hunt', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(s)])
}

export interface HuntStepResult {
  pool: number; target: number; done: boolean; stoppedReason?: 'target_reached' | 'daily_limit' | 'step_limit' | 'error'
  ran?: { city: string; category: string; found: number; newCount: number }
  pendingAudits: number; error?: string; log: string[]
}

export const MAX_STEPS_PER_DAY = 80

export async function huntStep(opts: { apiKey?: string | null; budgetMs?: number; fetchImpl?: typeof fetch; siteFetch?: typeof fetch; allowPrivate?: boolean; auto?: boolean } = {}): Promise<HuntStepResult> {
  const started = Date.now()
  const budget = opts.budgetMs ?? 45_000
  const timeLeft = () => budget - (Date.now() - started)
  const settings = await getSettings()
  const target = settings.target_market.daily_target || 50
  const state = await getHuntState()
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
  let pool = await poolCount()
  const finish = async (extra: Partial<HuntStepResult>): Promise<HuntStepResult> => {
    state.last_run_at = new Date().toISOString()
    if (opts.auto) state.last_auto_at = state.last_run_at
    await saveHuntState(state)
    return { pool, target, done: pool >= target, pendingAudits: pending, log: state.log.slice(-12), ...extra }
  }
  if (pool >= target) return finish({ stoppedReason: 'target_reached' })
  if (state.steps_today >= MAX_STEPS_PER_DAY) return finish({ stoppedReason: 'step_limit' })

  // 2) o căutare nouă: următorul oraș × meserie din rotație
  const { city, region, category } = rotation(state.cursor)
  const res = await runDiscovery({ city, region, category, limit: 60, minReviews: 3, mobileOnly: true }, opts.fetchImpl, { apiKey: opts.apiKey })
  state.cursor++
  state.steps_today++
  state.new_today += res.newCount
  const label = UK_CATEGORIES.find(c => c.key === category)?.label || category
  state.log.push(`${label} · ${city}: ${res.found} găsite, ${res.newCount} noi cu mobil${res.error ? ` (eroare: ${res.error})` : ''}`)
  if (opts.auto) state.last_auto_added = (state.last_auto_added || 0) + res.newCount

  // 3) auditul firmelor noi
  pending = await audit()
  pool = await poolCount()
  const ran = { city, category, found: res.found, newCount: res.newCount }
  if (res.stoppedReason === 'error') {
    // cheie lipsă / respinsă: nu are rost să continuăm
    if (/key|REQUEST_DENIED|403/i.test(res.error || '')) return finish({ ran, stoppedReason: 'error', error: res.error })
  }
  if (res.stoppedReason === 'daily_limit') {
    await logActivity(null, 'hunt', `Daily hunt stopped at the daily limit of new businesses (${settings.limits.daily_discovery_max})`)
    return finish({ ran, stoppedReason: 'daily_limit' })
  }
  return finish({ ran, stoppedReason: pool >= target ? 'target_reached' : undefined })
}
