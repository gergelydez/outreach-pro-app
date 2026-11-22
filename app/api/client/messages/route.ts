import { route, json, body, str, HttpError } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Citit / răspuns (prin telefon, WhatsApp sau email) / arhivat
export const PATCH = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ id?: string; status?: string; via?: string }>(req)
  const status = ['new', 'read', 'replied', 'archived'].find(s => s === b.status)
  if (!status || !b.id) throw new HttpError(400, 'invalid')
  const via = ['phone', 'whatsapp', 'email'].find(v => v === b.via) || null
  await q(`UPDATE site_messages SET status = $3, replied_via = CASE WHEN $3 = 'replied' THEN coalesce($4, replied_via) ELSE replied_via END,
             replied_at = CASE WHEN $3 = 'replied' THEN now() ELSE replied_at END
           WHERE id = $1 AND business_id = $2`, [str(b.id, 60), a.business_id, status, via])
  return json({ ok: true })
})
