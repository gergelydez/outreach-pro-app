import { route, json, HttpError } from '@/lib/crm/api'
import { adoptR2FromOtherProject } from '@/lib/crm/vercel-env'
import { DomainError } from '@/lib/crm/domain-connect'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Un buton: setările R2 luate din proiectul dashboard + republicare
export const POST = route(async () => {
  try { return json(await adoptR2FromOtherProject()) } catch (e) {
    if (e instanceof DomainError) throw new HttpError(400, e.message)
    throw e
  }
})
