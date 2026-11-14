import { route, json } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { aiConfig } from '@/lib/crm/ai'

export const dynamic = 'force-dynamic'

// Consum API pe furnizori (OpenAI, Google Places, PageSpeed) — ultimele 30 de zile
export const GET = route(async () => {
  const byProvider = await q<{ provider: string; requests: string; errors: string; input_tokens: string; output_tokens: string; cost: string }>(`
    SELECT provider, count(*)::text AS requests, count(*) FILTER (WHERE NOT ok)::text AS errors,
           coalesce(sum(input_tokens),0)::text AS input_tokens, coalesce(sum(output_tokens),0)::text AS output_tokens, coalesce(sum(cost_usd),0)::text AS cost
    FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY provider`)
  const byOperation = await q(`SELECT provider, operation, count(*)::text AS requests, coalesce(sum(cost_usd),0)::text AS cost
                               FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY provider, operation ORDER BY provider, operation`)
  const daily = await q(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, provider, coalesce(sum(cost_usd),0)::text AS cost, count(*)::text AS requests
                         FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY 1, 2 ORDER BY 1`)
  const recent = await q(`SELECT provider, operation, input_tokens, output_tokens, cost_usd, ok, error, created_at FROM api_usage ORDER BY created_at DESC LIMIT 30`)
  return json({
    byProvider: byProvider.map(r => ({ ...r, requests: Number(r.requests), errors: Number(r.errors), input_tokens: Number(r.input_tokens), output_tokens: Number(r.output_tokens), cost: Number(r.cost) })),
    byOperation, daily, recent,
    model: aiConfig().model || null,
    costsConfigured: !!(process.env.OPENAI_INPUT_COST_PER_1M && process.env.OPENAI_OUTPUT_COST_PER_1M),
  })
})
