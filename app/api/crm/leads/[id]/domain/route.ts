import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q } from '@/lib/crm/db'
import { connectDomain, cleanDomain, DomainError } from '@/lib/crm/domain-connect'
import { logActivity } from '@/lib/crm/activity'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Un buton: salvează domeniul și îl leagă (Vercel + DNS Cloudflare) → site-ul e mereu la zi pe domeniu
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const id = requireUuid(params.id)
  const b = await body<{ domain?: string }>(req)
  let domain: string
  try { domain = cleanDomain(str(b.domain, 300) || '') } catch (e) { throw new HttpError(400, (e as Error).message) }
  await q('UPDATE businesses SET live_url = $2, updated_at = now() WHERE id = $1', [id, `https://${domain}`])
  try {
    const r = await connectDomain(domain)
    await logActivity(id, 'domain_connected', `Site served on ${domain}`)
    return json({ ok: true, domain, verified: r.verified })
  } catch (e) {
    if (e instanceof DomainError) {
      if (e.message === 'setup') return json({ ok: false, domain, setup: true })
      throw new HttpError(400, e.message)
    }
    throw e
  }
})
