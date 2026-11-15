import { route, json, body, str } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { huntStep, getHuntState, poolCount, MAX_STEPS_PER_DAY } from '@/lib/crm/hunt'
import { placesMode } from '@/lib/crm/discovery'
import { getSettings } from '@/lib/crm/settings'
import { placesKey } from '@/lib/crm/providers/google-places'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Starea vânătorii zilnice: câte firme bune sunt în „lista zilei”, ce s-a căutat azi, costul de azi
export const GET = route(async () => {
  const settings = await getSettings()
  const state = await getHuntState()
  const cost = await one<{ c: string; n: string }>(`SELECT coalesce(sum(cost_usd),0)::text AS c, count(*)::text AS n FROM api_usage WHERE provider = 'google_places' AND created_at >= date_trunc('day', now())`)
  const pending = await one<{ n: string }>(`SELECT count(*)::text AS n FROM audit_jobs WHERE status IN ('pending','running') AND run_after <= now()`)
  const newToday = await q<{ n: string }>(`SELECT count(*)::text AS n FROM businesses WHERE created_at >= date_trunc('day', now())`)
  return json({
    pool: await poolCount(), target: settings.target_market.daily_target || 50,
    state, maxSteps: MAX_STEPS_PER_DAY, dailyNewMax: settings.limits.daily_discovery_max, newToday: Number(newToday[0]?.n || 0),
    googleCostToday: Number(cost?.c || 0), googleRequestsToday: Number(cost?.n || 0),
    pendingAudits: Number(pending?.n || 0), placesMode: await placesMode(), serverKey: !!placesKey(),
  })
})

// Un pas: o căutare (oraș × meserie) + auditurile ei. Interfața repetă până la 50.
export const POST = route(async (req: Request) => {
  const b = await body<{ google_api_key?: string }>(req)
  return json(await huntStep({ apiKey: str(b.google_api_key, 200), budgetMs: 45_000 }))
})
