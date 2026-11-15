import { route, json, body, int } from '@/lib/crm/api'
import { runPendingAudits } from '@/lib/crm/audit-runner'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Auditează următoarele site-uri din coadă direct în aplicație. Interfața o apelează
// repetat (câte câteva odată) până când `remaining` ajunge la 0.
export const POST = route(async (req: Request) => {
  const b = await body<{ limit?: number }>(req)
  return json(await runPendingAudits(int(b.limit, 4, 1, 8)))
})
