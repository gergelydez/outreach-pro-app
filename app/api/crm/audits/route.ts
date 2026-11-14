import { route, json } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { jobCounts } from '@/lib/crm/jobs'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Ultimele audituri + distribuția statusurilor de site + starea cozii
export const GET = route(async () => {
  const audits = await q(`SELECT a.id, a.business_id, a.url, a.final_url, a.reachable, a.website_status, a.error, a.created_at,
                                 jsonb_array_length(a.findings) AS findings_count, a.pagespeed->>'performance' AS performance,
                                 b.name AS business_name, b.city, b.opportunity_score
                          FROM website_audits a JOIN businesses b ON b.id = a.business_id ORDER BY a.created_at DESC LIMIT 100`)
  const statuses = await q<{ website_status: string; n: string }>(`SELECT website_status, count(*)::text AS n FROM businesses GROUP BY 1 ORDER BY 2 DESC`)
  return json({ audits, statuses: statuses.map(s => ({ key: s.website_status, n: Number(s.n) })), jobs: await jobCounts() })
})
