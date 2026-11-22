import { route, json, body } from '@/lib/crm/api'
import { requireClient, changePassword } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ current?: string; next?: string }>(req)
  await guard(changePassword(a.id, typeof b.current === 'string' ? b.current : '', typeof b.next === 'string' ? b.next : ''))
  return json({ ok: true })
})
