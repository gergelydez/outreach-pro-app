import { route, json, body, HttpError } from '@/lib/crm/api'
import { getSettings, saveSetting, DEFAULT_SETTINGS, type CrmSettings, type SettingsKey } from '@/lib/crm/settings'
import { rescoreAll } from '@/lib/crm/businesses'
import { aiConfig } from '@/lib/crm/ai'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Setările nu conțin chei API: cheile stau doar în variabilele de mediu ale serverului,
// iar browserul primește doar dacă sunt configurate.
export const GET = route(async () => {
  return json({
    settings: await getSettings(),
    defaults: DEFAULT_SETTINGS,
    integrations: {
      google_places: !!process.env.GOOGLE_PLACES_API_KEY,
      pagespeed: 'configured on the worker (PAGESPEED_API_KEY)',
      openai: !!aiConfig().key,
      openai_model: aiConfig().model || null,
      worker_token: !!process.env.CRM_WORKER_TOKEN,
    },
  })
})

const KEYS: SettingsKey[] = ['business_profile', 'target_market', 'limits', 'scoring', 'services', 'outreach']

export const PUT = route(async (req: Request) => {
  const b = await body<{ key?: string; value?: unknown }>(req)
  const key = KEYS.find(k => k === b.key)
  if (!key || b.value == null || typeof b.value !== 'object') throw new HttpError(400, 'Invalid settings payload')
  const value = sanitize(key, b.value)
  await saveSetting(key, value as CrmSettings[typeof key])
  // schimbarea ponderilor recalculează scorurile tuturor lead-urilor
  const rescored = key === 'scoring' ? await rescoreAll() : 0
  return json({ ok: true, rescored })
})

function sanitize(key: SettingsKey, v: unknown): unknown {
  const def = DEFAULT_SETTINGS[key] as unknown
  if (key === 'services') {
    if (!Array.isArray(v)) throw new HttpError(400, 'Services must be a list')
    return v.slice(0, 30).map((s, i) => ({ key: String(s.key || `item_${i}`).slice(0, 40), label: String(s.label || '').slice(0, 120), price: Math.max(0, Number(s.price) || 0), recurring: s.recurring === 'monthly' ? 'monthly' : null })).filter(s => s.label)
  }
  const out: Record<string, unknown> = {}
  for (const [k, dv] of Object.entries(def as Record<string, unknown>)) {
    const x = (v as Record<string, unknown>)[k]
    if (x === undefined) { out[k] = dv; continue }
    if (typeof dv === 'number') out[k] = Math.max(0, Math.min(100000, Number(x) || 0))
    else if (Array.isArray(dv)) out[k] = Array.isArray(x) ? x.slice(0, 30).map(e => (typeof dv[0] === 'number' ? Math.max(0, Number(e) || 0) : String(e).slice(0, 80))) : dv
    else out[k] = String(x).slice(0, 500)
  }
  return out
}
