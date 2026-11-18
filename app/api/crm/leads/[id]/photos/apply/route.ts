import { waitUntil } from '@vercel/functions'
import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { startPhotos } from '@/lib/crm/demo'

// Claude se uită la toate pozele, le alege pe cele mai bune și le pune în site (1–4 minute, în fundal)
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const id = requireUuid(params.id)
  const b = await body<{ note?: string; anthropic_key?: string; designer?: string }>(req)
  const r = await startPhotos(id, { note: str(b.note, 1000) || undefined, anthropicKey: str(b.anthropic_key, 300) || undefined, designer: str(b.designer, 60) || undefined }, { schedule: p => waitUntil(p) })
    .catch(e => { throw new HttpError(/not found/i.test(String(e?.message)) ? 404 : 400, e instanceof Error ? e.message : String(e)) })
  return json({ status: r.status, already: r.already, count: 'count' in r ? r.count : undefined })
})
