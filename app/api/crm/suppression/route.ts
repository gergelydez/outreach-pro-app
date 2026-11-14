import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { normalizeUkPhone, normalizeDomain } from '@/lib/crm/normalize'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Lista de excludere (opt-out): contactele de aici nu mai primesc mesaje și nu mai sunt importate
export const GET = route(async () => json({ items: await q('SELECT * FROM suppression_list ORDER BY created_at DESC LIMIT 500') }))

export const POST = route(async (req: Request) => {
  const b = await body<{ kind?: string; value?: string; reason?: string }>(req)
  const kind = ['email', 'phone', 'domain'].find(k => k === b.kind)
  const raw = str(b.value, 200)
  if (!kind || !raw) throw new HttpError(400, 'Kind (email, phone, domain) and value are required')
  const value = kind === 'email' ? raw.toLowerCase() : kind === 'phone' ? normalizeUkPhone(raw) : normalizeDomain(raw)
  if (!value) throw new HttpError(400, 'Value is not valid for this kind')
  const item = await one(`INSERT INTO suppression_list (kind, value, reason) VALUES ($1,$2,$3) ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason RETURNING *`, [kind, value, str(b.reason, 300)])
  return json({ item })
})

export const DELETE = route(async (req: Request) => {
  await q('DELETE FROM suppression_list WHERE id = $1', [requireUuid(new URL(req.url).searchParams.get('id'))])
  return json({ ok: true })
})
