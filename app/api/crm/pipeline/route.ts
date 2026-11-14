import { route, json } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { STAGES } from '@/lib/crm/constants'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Kanban: cele mai bune 100 de lead-uri din fiecare etapă (după scor)
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const city = sp.get('city'), category = sp.get('category')
  const cond: string[] = []
  const params: unknown[] = []
  if (city) { params.push(city); cond.push(`city = $${params.length}`) }
  if (category) { params.push(category); cond.push(`category = $${params.length}`) }
  const rows = await q<{ stage: string }>(
    `SELECT * FROM (
       SELECT id, name, city, category, website_status, opportunity_score, stage, deal_value, next_follow_up_at, stage_changed_at,
              row_number() OVER (PARTITION BY stage ORDER BY opportunity_score DESC NULLS LAST, created_at DESC) AS rn
       FROM businesses ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}) x
     WHERE rn <= 100`, params)
  const counts = await q<{ stage: string; n: string; value: string }>(`SELECT stage, count(*)::text AS n, coalesce(sum(deal_value),0)::text AS value FROM businesses ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} GROUP BY stage`, params)
  return json({
    columns: STAGES.map(s => ({
      ...s,
      count: Number(counts.find(c => c.stage === s.key)?.n || 0),
      value: Number(counts.find(c => c.stage === s.key)?.value || 0),
      leads: rows.filter(r => r.stage === s.key),
    })),
  })
})
