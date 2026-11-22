import { route, json, body, str } from '@/lib/crm/api'
import { login, sessionCookie } from '@/lib/crm/client-auth'
import { withCookie, guard } from '@/lib/crm/client-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string }>(req)
  const id = await guard(login(str(b.email, 160) || '', typeof b.password === 'string' ? b.password : ''))
  return withCookie(json({ ok: true }), await sessionCookie(id))
})
