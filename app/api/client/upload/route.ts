import { route } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { storeUpload } from '@/lib/crm/upload'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Pozele urcate de client din aplicație (galerie, camere) — doar în folderul firmei lui
export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  return storeUpload(req, p => p.startsWith(`cms/${a.business_id}/`))
})
