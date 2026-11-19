import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { route, json, HttpError } from '@/lib/crm/api'
import { verifyPortal, PortalError } from '@/lib/crm/portal'

// Pozele din galerie urcate de client direct în Blob; PIN-ul vine în clientPayload
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: { token: string } }) => {
  const b = (await req.json()) as HandleUploadBody
  const res = await handleUpload({
    request: req,
    body: b,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      let pin = ''
      try { pin = String(JSON.parse(clientPayload || '{}').pin || '') } catch { /* gol */ }
      const p = await verifyPortal(params.token, pin).catch(e => { throw e instanceof PortalError ? new HttpError(e.status, e.message) : e })
      if (!pathname.startsWith(`cms/${p.business_id}/`)) throw new HttpError(400, 'Cale invalidă')
      return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 8 * 1024 * 1024, addRandomSuffix: true }
    },
  })
  return json(res)
})
