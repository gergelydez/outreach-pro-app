import { route } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { buildLeadFilter, LEAD_COLUMNS } from '@/lib/crm/leads-query'
import { csvCell } from '@/lib/crm/csv'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const { where, params, order } = buildLeadFilter(new URL(req.url).searchParams)
  const rows = await q<Record<string, unknown>>(`SELECT ${LEAD_COLUMNS} FROM businesses ${where} ORDER BY ${order} LIMIT 10000`, params)
  const cols = ['name', 'category', 'city', 'address', 'postcode', 'phone', 'email', 'website_url', 'website_status', 'whatsapp_status', 'google_rating',
    'google_review_count', 'opportunity_score', 'opportunity_label', 'stage', 'deal_value', 'last_contacted_at', 'next_follow_up_at', 'lead_source', 'subscriber_type', 'tags', 'created_at']
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n')
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  })
})
