import { waitUntil } from '@vercel/functions'
import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { startEdit } from '@/lib/crm/demo'

// Modificările cerute de client se fac pe server (1–4 minute), pe același link; pagina poate fi închisă.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const id = requireUuid(params.id)
  const b = await body<{ instructions?: string; anthropic_key?: string; designer?: string; images?: string[] }>(req)
  const instructions = str(b.instructions, 4000)
  if (!instructions || instructions.trim().length < 3) throw new HttpError(400, 'Scrie ce modificări vrea clientul.')
  const r = await startEdit(id, { instructions: instructions.trim(), anthropicKey: str(b.anthropic_key, 300) || undefined, designer: str(b.designer, 60) || undefined, images: Array.isArray(b.images) ? b.images.map(u => String(u).slice(0, 500)) : undefined }, { schedule: p => waitUntil(p) })
    .catch(e => { throw new HttpError(/not found/i.test(String(e?.message)) ? 404 : 400, e instanceof Error ? e.message : String(e)) })
  return json({ status: r.status, already: r.already })
})
