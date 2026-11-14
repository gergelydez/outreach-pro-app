import { route, json } from '@/lib/crm/api'
import { SESSION_COOKIE } from '@/lib/crm/session'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


export const POST = route(async () => {
  const res = json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
})
