import { route, json, body, str } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { confirmEmailCode } from '@/lib/crm/notify-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ code?: string }>(req)
  return json({ ok: true, email: await guard(confirmEmailCode(a.id, str(b.code, 10) || '')) })
})
