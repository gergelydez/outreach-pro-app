// Panoul clientului: răspunsuri JSON + cookie de sesiune; erorile de cont devin coduri HTTP clare
import { json, HttpError } from '@/lib/crm/api'
import { ClientAuthError } from '@/lib/crm/client-auth'

export function withCookie(res: Response, cookie: string) {
  const h = new Headers(res.headers)
  h.append('Set-Cookie', cookie)
  return new Response(res.body, { status: res.status, headers: h })
}

export async function guard<T>(p: Promise<T>): Promise<T> {
  try { return await p } catch (e) {
    if (e instanceof ClientAuthError) throw new HttpError(e.status, e.message)
    throw e
  }
}

export { json }
