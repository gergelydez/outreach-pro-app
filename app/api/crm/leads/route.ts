import { route, json, body, int, str, isUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { buildLeadFilter, LEAD_COLUMNS } from '@/lib/crm/leads-query'
import { changeStage } from '@/lib/crm/businesses'
import { enqueueJob } from '@/lib/crm/jobs'
import { logActivity } from '@/lib/crm/activity'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const { where, params, order } = buildLeadFilter(sp)
  const pageSize = int(sp.get('page_size'), 25, 5, 100)
  const page = int(sp.get('page'), 1, 1, 100000)
  const total = await one<{ n: string }>(`SELECT count(*)::text AS n FROM businesses ${where}`, params)
  const rows = await q(`SELECT ${LEAD_COLUMNS} FROM businesses ${where} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params)
  const facets = await one<{ cities: string[]; categories: string[]; tags: string[] }>(
    `SELECT array(SELECT DISTINCT city FROM businesses WHERE city IS NOT NULL ORDER BY 1) AS cities,
            array(SELECT DISTINCT category FROM businesses WHERE category IS NOT NULL ORDER BY 1) AS categories,
            array(SELECT DISTINCT t FROM businesses, unnest(tags) AS t ORDER BY 1) AS tags`)
  return json({ rows, total: Number(total?.n || 0), page, page_size: pageSize, facets })
})

// Acțiuni în lot pe lead-urile selectate
export const POST = route(async (req: Request) => {
  const b = await body<{ ids?: unknown[]; action?: string; value?: unknown }>(req)
  const ids = (b.ids || []).filter(isUuid).slice(0, 500) as string[]
  if (!ids.length) throw new HttpError(400, 'No leads selected')
  const value = str(b.value, 60)
  switch (b.action) {
    case 'tag':
      if (!value) throw new HttpError(400, 'Tag required')
      await q(`UPDATE businesses SET tags = array(SELECT DISTINCT t FROM unnest(tags || ARRAY[$2]::text[]) AS t), updated_at = now() WHERE id = ANY($1)`, [ids, value.toLowerCase()])
      break
    case 'untag':
      await q(`UPDATE businesses SET tags = array_remove(tags, $2), updated_at = now() WHERE id = ANY($1)`, [ids, (value || '').toLowerCase()])
      break
    case 'stage':
      for (const id of ids) await changeStage(id, value || '')
      break
    case 'reaudit':
      for (const id of ids) await enqueueJob('audit', id, { manual: true }, { key: `audit:${id}:manual:${Date.now()}` })
      break
    case 'delete':
      await q(`DELETE FROM businesses WHERE id = ANY($1)`, [ids])
      await logActivity(null, 'leads_deleted', `Deleted ${ids.length} lead(s)`)
      break
    default:
      throw new HttpError(400, 'Unknown action')
  }
  return json({ ok: true, count: ids.length })
})
