import { route, json } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { getSettings } from '@/lib/crm/settings'
import { CONTACTED_STAGES } from '@/lib/crm/constants'
import { jobCounts } from '@/lib/crm/jobs'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export const GET = route(async () => {
  const settings = await getSettings()
  const k = await one<Record<string, string>>(`
    SELECT count(*)::text AS total,
      count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::text AS today,
      count(*) FILTER (WHERE stage NOT IN ('new_lead','researching','not_a_fit','lost') OR opportunity_score >= 60)::text AS qualified,
      count(*) FILTER (WHERE opportunity_score >= 60)::text AS high,
      count(*) FILTER (WHERE stage = ANY($1))::text AS contacted,
      count(*) FILTER (WHERE stage IN ('call_meeting','proposal_sent','negotiation','won'))::text AS meetings,
      count(*) FILTER (WHERE stage = 'won')::text AS won,
      coalesce(sum(deal_value) FILTER (WHERE stage NOT IN ('won','lost','not_a_fit')), 0)::text AS pipeline_value,
      coalesce(sum(deal_value) FILTER (WHERE stage = 'won'), 0)::text AS revenue
    FROM businesses`, [CONTACTED_STAGES])
  const replies = await one<{ n: string }>(`SELECT count(DISTINCT business_id)::text AS n FROM outreach_events WHERE event_type = 'reply'`)
  const daily = await q<{ day: string; n: string }>(`
    SELECT to_char(d, 'YYYY-MM-DD') AS day, (SELECT count(*) FROM businesses b WHERE b.created_at >= d AND b.created_at < d + interval '1 day')::text AS n
    FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d`)
  const stages = await q<{ stage: string; n: string; value: string }>(`SELECT stage, count(*)::text AS n, coalesce(sum(deal_value),0)::text AS value FROM businesses GROUP BY stage`)
  const top = await q(`SELECT id, name, city, category, website_status, opportunity_score, stage FROM businesses
                       WHERE stage NOT IN ('won','lost','not_a_fit') AND opportunity_score IS NOT NULL ORDER BY opportunity_score DESC LIMIT 8`)
  const activity = await q(`SELECT a.id, a.type, a.summary, a.created_at, a.business_id, b.name AS business_name
                            FROM crm_activity a LEFT JOIN businesses b ON b.id = a.business_id ORDER BY a.created_at DESC LIMIT 15`)
  const tasks = await q(`SELECT t.id, t.title, t.due_at, t.priority, t.business_id, b.name AS business_name
                         FROM follow_up_tasks t LEFT JOIN businesses b ON b.id = t.business_id
                         WHERE t.status = 'open' AND t.due_at < date_trunc('day', now()) + interval '1 day' ORDER BY t.due_at LIMIT 15`)
  return json({
    kpis: {
      total: Number(k?.total), today: Number(k?.today), qualified: Number(k?.qualified), high: Number(k?.high), contacted: Number(k?.contacted),
      replies: Number(replies?.n), meetings: Number(k?.meetings), won: Number(k?.won), pipeline_value: Number(k?.pipeline_value), revenue: Number(k?.revenue),
    },
    daily_target: settings.target_market.daily_target,
    daily: daily.map(d => ({ day: d.day, n: Number(d.n) })),
    stages: stages.map(s => ({ stage: s.stage, n: Number(s.n), value: Number(s.value) })),
    top, activity, tasks, jobs: await jobCounts(),
  })
})
