import { route, json, body, str } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { requestEmailCode, disableEmail } from '@/lib/crm/notify-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Trimite codul de confirmare pe emailul ales
export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ email?: string }>(req)
  await guard(requestEmailCode(a.id, str(b.email, 160) || ''))
  return json({ ok: true })
})

// Oprește notificările pe email
export const DELETE = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  await disableEmail(a.id)
  return json({ ok: true })
})
