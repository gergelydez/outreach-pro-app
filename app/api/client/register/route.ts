import { route, json, body, str, HttpError } from '@/lib/crm/api'
import { verifyPortal, PortalError } from '@/lib/crm/portal'
import { registerAccount, sessionCookie } from '@/lib/crm/client-auth'
import { withCookie, guard } from '@/lib/crm/client-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Creare cont (sau resetare parolă) cu linkul + codul primite de la designer
export const POST = route(async (req: Request) => {
  const b = await body<{ token?: string; pin?: string; email?: string; password?: string }>(req)
  const p = await verifyPortal(str(b.token, 60) || '', str(b.pin, 10) || '').catch(e => { throw e instanceof PortalError ? new HttpError(e.status, e.message) : e })
  const id = await guard(registerAccount(p.business_id, str(b.email, 160) || '', typeof b.password === 'string' ? b.password : ''))
  return withCookie(json({ ok: true }), await sessionCookie(id))
})

// Ce afișează pagina de invitație: există deja cont? (fără PIN nu dăm alte date)
export const GET = route(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') || ''
  const { one } = await import('@/lib/crm/db')
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new HttpError(404, 'invalid')
  const r = await one<{ name: string; country: string; has_account: boolean }>(`SELECT b.name, b.country, (a.id IS NOT NULL) AS has_account
      FROM client_portals p JOIN businesses b ON b.id = p.business_id LEFT JOIN client_accounts a ON a.business_id = p.business_id WHERE p.token = $1`, [token])
  if (!r) throw new HttpError(404, 'invalid')
  return json(r)
})
