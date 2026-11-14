import { route, json } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { toCsv } from '@/lib/crm/csv'
import { CONTACTED_STAGES } from '@/lib/crm/constants'

export const dynamic = 'force-dynamic'

// Rapoarte pe interval (implicit ultimele 30 de zile), din date reale. ?format=csv pentru export.
export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const to = iso.test(sp.get('to') || '') ? sp.get('to')! : new Date().toISOString().slice(0, 10)
  const from = iso.test(sp.get('from') || '') ? sp.get('from')! : new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10)
  const range = `created_at >= $1::date AND created_at < ($2::date + interval '1 day')`
  const P = [from, to]

  const byCity = await q<{ key: string; n: string }>(`SELECT coalesce(city,'Unknown') AS key, count(*)::text AS n FROM businesses WHERE ${range} GROUP BY 1 ORDER BY 2 DESC`, P)
  const byCategory = await q<{ key: string; n: string }>(`SELECT coalesce(category,'Unknown') AS key, count(*)::text AS n FROM businesses WHERE ${range} GROUP BY 1 ORDER BY 2 DESC`, P)
  const byStatus = await q<{ key: string; n: string }>(`SELECT website_status AS key, count(*)::text AS n FROM businesses WHERE ${range} GROUP BY 1 ORDER BY 2 DESC`, P)
  const funnel = await one<Record<string, string>>(`
    SELECT count(*)::text AS leads,
      count(*) FILTER (WHERE opportunity_score >= 60)::text AS high_opportunity,
      count(*) FILTER (WHERE stage = ANY($3) OR last_contacted_at IS NOT NULL)::text AS contacted,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM outreach_events e WHERE e.business_id = businesses.id AND e.event_type = 'reply'))::text AS replied,
      count(*) FILTER (WHERE stage IN ('interested','call_meeting','proposal_sent','negotiation','won'))::text AS interested,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM proposals p WHERE p.business_id = businesses.id AND p.status <> 'draft'))::text AS proposals,
      count(*) FILTER (WHERE stage = 'won')::text AS won,
      count(*) FILTER (WHERE stage = 'lost')::text AS lost,
      coalesce(sum(deal_value) FILTER (WHERE stage = 'won'),0)::text AS revenue,
      coalesce(avg(deal_value) FILTER (WHERE stage = 'won'),0)::text AS avg_deal,
      coalesce(sum(deal_value) FILTER (WHERE stage NOT IN ('won','lost','not_a_fit')),0)::text AS pipeline_value
    FROM businesses WHERE ${range}`, [...P, CONTACTED_STAGES])
  const outreach = await q<{ channel: string; contacted: string; replies: string }>(`
    SELECT coalesce(channel,'unknown') AS channel, count(*) FILTER (WHERE event_type = 'contacted')::text AS contacted, count(*) FILTER (WHERE event_type = 'reply')::text AS replies
    FROM outreach_events WHERE occurred_at >= $1::date AND occurred_at < ($2::date + interval '1 day') GROUP BY 1 ORDER BY 2 DESC`, P)
  const ai = await one<{ requests: string; cost: string; tokens: string }>(`SELECT count(*)::text AS requests, coalesce(sum(cost_usd),0)::text AS cost, coalesce(sum(input_tokens + output_tokens),0)::text AS tokens
                                                                          FROM api_usage WHERE provider = 'openai' AND ${range}`, P)
  const top = await q(`SELECT id, name, city, category, website_status, opportunity_score, stage FROM businesses WHERE ${range} AND opportunity_score >= 60 ORDER BY opportunity_score DESC LIMIT 20`, P)

  const n = (k: string) => Number(funnel?.[k] || 0)
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
  const summary = {
    leads: n('leads'), high_opportunity: n('high_opportunity'), contacted: n('contacted'), replied: n('replied'), interested: n('interested'),
    proposals: n('proposals'), won: n('won'), lost: n('lost'), revenue: n('revenue'), avg_deal: Math.round(n('avg_deal')), pipeline_value: n('pipeline_value'),
    reply_rate: pct(n('replied'), n('contacted')), interested_rate: pct(n('interested'), n('contacted')), proposal_rate: pct(n('proposals'), n('contacted')),
    win_rate: pct(n('won'), n('won') + n('lost')),
    ai_requests: Number(ai?.requests || 0), ai_cost: Number(ai?.cost || 0), ai_tokens: Number(ai?.tokens || 0),
  }

  if (sp.get('format') === 'csv') {
    const rows = [
      ...Object.entries(summary).map(([metric, value]) => ({ section: 'summary', metric, value })),
      ...byCity.map(r => ({ section: 'city', metric: r.key, value: r.n })),
      ...byCategory.map(r => ({ section: 'category', metric: r.key, value: r.n })),
      ...byStatus.map(r => ({ section: 'website_status', metric: r.key, value: r.n })),
    ]
    return new Response(toCsv(rows, ['section', 'metric', 'value']), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="crm-report-${from}-to-${to}.csv"` },
    })
  }
  const num = (rows: { key: string; n: string }[]) => rows.map(r => ({ key: r.key, n: Number(r.n) }))
  return json({ from, to, summary, byCity: num(byCity), byCategory: num(byCategory), byStatus: num(byStatus), outreach, top })
})
