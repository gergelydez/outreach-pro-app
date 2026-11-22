import { route, json } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { requireClient, getSecrets } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { sanitizeContent } from '@/lib/crm/cms-shared'
import { listSiteMessages } from '@/lib/crm/site-messages'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Tot ce afișează aplicația clientului
export const GET = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const p = await one<{ content: unknown }>('SELECT content FROM client_portals WHERE business_id = $1', [a.business_id])
  return json({
    account: { email: a.email },
    business: { id: a.business_id, name: a.name, country: a.country, preview_url: a.preview_url, live_url: a.live_url },
    content: sanitizeContent(p?.content),
    messages: await listSiteMessages(a.business_id, 100),
    vapidPublicKey: (await getSecrets()).vapidPublic,
  })
})
