import { route, json, body, HttpError } from '@/lib/crm/api'
import { checkPassword, createSession, SESSION_COOKIE, SESSION_DAYS } from '@/lib/crm/session'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60


// Încercări greșite repetate sunt încetinite (limită simplă per instanță)
const attempts = new Map<string, { n: number; until: number }>()

export const POST = route(async (req: Request) => {
  if (!process.env.CRM_PASSWORD) throw new HttpError(503, 'CRM_PASSWORD is not set on the server. Add it in your hosting environment variables.')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const a = attempts.get(ip)
  if (a && a.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a minute.')
  const { password } = await body<{ password?: string }>(req)
  if (!password || !(await checkPassword(password))) {
    const n = (a?.n || 0) + 1
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 })
    throw new HttpError(401, 'Wrong password')
  }
  attempts.delete(ip)
  const res = json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 })
  return res
})
