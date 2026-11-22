import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { route, json, HttpError } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Pozele pentru galerie urcate de client direct în Blob (biletul de urcare doar cu sesiune validă)
export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = (await req.json()) as HandleUploadBody
  return json(await handleUpload({
    request: req,
    body: b,
    onBeforeGenerateToken: async pathname => {
      if (!pathname.startsWith(`cms/${a.business_id}/`)) throw new HttpError(400, 'invalid path')
      return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 8 * 1024 * 1024, addRandomSuffix: true }
    },
  }))
})
