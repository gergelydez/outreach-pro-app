import { route, json, body } from '@/lib/crm/api'
import { requireClient } from '@/lib/crm/client-auth'
import { guard } from '@/lib/crm/client-http'
import { saveContent } from '@/lib/crm/portal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const PUT = route(async (req: Request) => {
  const a = await guard(requireClient(req))
  const b = await body<{ content?: unknown }>(req)
  return json({ ok: true, content: await saveContent(a.business_id, b.content) })
})
