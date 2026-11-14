import { q, type Queryable, db } from './db'

export async function logActivity(businessId: string | null, type: string, summary: string, meta: Record<string, unknown> = {}, on: Queryable = db()) {
  await q('INSERT INTO crm_activity (business_id, type, summary, meta) VALUES ($1, $2, $3, $4)', [businessId, type, summary, JSON.stringify(meta)], on)
}

export async function logUsage(u: { provider: string; operation: string; units?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; ok?: boolean; error?: string | null }) {
  await q(`INSERT INTO api_usage (provider, operation, units, input_tokens, output_tokens, cost_usd, ok, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [u.provider, u.operation, u.units ?? 1, u.inputTokens ?? 0, u.outputTokens ?? 0, u.costUsd ?? 0, u.ok ?? true, u.error ? String(u.error).slice(0, 500) : null])
}
