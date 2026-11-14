import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { logActivity } from '@/lib/crm/activity'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


type Ctx = { params: { id: string } }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const text = str((await body<{ body?: string }>(req)).body, 5000)
  if (!text) throw new HttpError(400, 'Note is empty')
  const note = await one('INSERT INTO crm_notes (business_id, body) VALUES ($1, $2) RETURNING *', [id, text])
  await logActivity(id, 'note_added', `Note: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`)
  return json({ note })
})
