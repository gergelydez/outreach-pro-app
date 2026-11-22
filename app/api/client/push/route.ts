import { route, json, body, HttpError } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { saveSubscription, removeSubscription, type PushSub } from '@/lib/crm/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ subscription?: PushSub }>(req)
  await saveSubscription(a.business_id, b.subscription as PushSub).catch(() => { throw new HttpError(400, 'invalid subscription') })
  return json({ ok: true })
})

export const DELETE = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ endpoint?: string }>(req)
  if (b.endpoint) await removeSubscription(a.business_id, String(b.endpoint))
  return json({ ok: true })
})
