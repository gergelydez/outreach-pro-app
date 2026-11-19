import { route, json, body, str, HttpError } from '@/lib/crm/api'
import { verifyPortal, saveContent, PortalError } from '@/lib/crm/portal'

// Panoul clientului (fără cont): link privat + PIN de 6 cifre la fiecare cerere
export const maxDuration = 30
export const dynamic = 'force-dynamic'

type Ctx = { params: { token: string } }
const guard = <T,>(p: Promise<T>) => p.catch(e => { if (e instanceof PortalError) throw new HttpError(e.status, e.message); throw e })

// Intrare: verifică PIN-ul și dă datele de editat
export const POST = route(async (req: Request, { params }: Ctx) => {
  const b = await body<{ pin?: string }>(req)
  const p = await guard(verifyPortal(params.token, str(b.pin, 10) || ''))
  return json({ id: p.business_id, name: p.name, country: p.country, preview_url: p.preview_url, content: p.content })
})

// Salvează: site-ul se actualizează în câteva secunde
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const b = await body<{ pin?: string; content?: unknown }>(req)
  const p = await guard(verifyPortal(params.token, str(b.pin, 10) || ''))
  return json({ ok: true, content: await saveContent(p.business_id, b.content) })
})
