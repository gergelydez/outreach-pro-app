import { route, json, body, HttpError } from '@/lib/crm/api'
import { cleanupPreview, runCleanup } from '@/lib/crm/cleanup'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Câte firme rămân / se șterg
export const GET = route(async () => json(await cleanupPreview()))

// Șterge firmele necontactate (cere confirmare explicită)
export const POST = route(async (req: Request) => {
  const b = await body<{ confirm?: string }>(req)
  if (b.confirm !== 'STERGE') throw new HttpError(400, 'Confirmarea lipsește.')
  return json(await runCleanup())
})
