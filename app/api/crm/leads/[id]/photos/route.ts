import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
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

// Browserul urcă pozele direct în Blob (fără limita de 4,5 MB a funcțiilor); aici dăm doar „biletul” de urcare
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  if (!(await one('SELECT 1 FROM businesses WHERE id = $1', [id]))) throw new HttpError(404, 'Lead not found')
  const b = (await req.json()) as HandleUploadBody
  const res = await handleUpload({
    request: req,
    body: b,
    onBeforeGenerateToken: async pathname => {
      if (!pathname.startsWith(PHOTO_PREFIX(id)) && !pathname.startsWith(`edit-shots/${id}/`)) throw new HttpError(400, 'Cale invalidă')
      return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 8 * 1024 * 1024, addRandomSuffix: true }
    },
  })
  return json(res)
})

// Șterge toate pozele încărcate (de exemplu dacă ai greșit clientul)
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const urls = await listClientPhotos(id)
  if (urls.length) { const { del } = await import('@vercel/blob'); await del(urls) }
  return json({ deleted: urls.length })
})
