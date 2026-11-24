import { storeUpload } from '@/lib/crm/upload'
import { deleteFiles } from '@/lib/object-store'
import { route, json, requireUuid, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { listClientPhotos, PHOTO_PREFIX, MAX_PHOTOS } from '@/lib/crm/demo'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// Pozele încărcate pentru această firmă
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  return json({ photos: await listClientPhotos(id), max: MAX_PHOTOS })
})

// Pozele (micșorate în browser) se urcă prin server, în R2 sau Blob
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  if (!(await one('SELECT 1 FROM businesses WHERE id = $1', [id]))) throw new HttpError(404, 'Lead not found')
  return storeUpload(req, p => p.startsWith(PHOTO_PREFIX(id)) || p.startsWith(`edit-shots/${id}/`))
})

// Șterge toate pozele încărcate (de exemplu dacă ai greșit clientul)
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const urls = await listClientPhotos(id)
  await deleteFiles(urls)
  return json({ deleted: urls.length })
})
