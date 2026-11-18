import { route, json, body, isUuid, str, HttpError } from '@/lib/crm/api'
import { one } from '@/lib/crm/db'
import { runAi, type AiKind } from '@/lib/crm/ai'
import { logActivity } from '@/lib/crm/activity'
import type { BusinessRow } from '@/lib/crm/businesses'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const KINDS: AiKind[] = ['analysis', 'outreach', 'proposal', 'reply', 'next_action', 'quick']

// Rulează o sarcină AI pe datele verificate ale unui lead. Rezultatele identice sunt
// luate din cache (fără cost) până când datele lead-ului se schimbă sau ceri „Regenerate”.
export const POST = route(async (req: Request) => {
  const b = await body<{ kind?: string; business_id?: string; reply_text?: string; force?: boolean; note?: string; sender?: string; language?: string; offer?: string; sent?: string }>(req)
  const kind = KINDS.find(k => k === b.kind)
  if (!kind) throw new HttpError(400, 'Unknown AI task')
  let business: BusinessRow | null = null
  if (isUuid(b.business_id)) {
    business = await one<BusinessRow>('SELECT * FROM businesses WHERE id = $1', [b.business_id])
    if (!business) throw new HttpError(404, 'Lead not found')
  } else if (kind !== 'reply') {
    throw new HttpError(400, 'business_id is required')
  }
  const extra: Record<string, unknown> = {}
  if (kind === 'reply') {
    const text = str(b.reply_text, 6000)
    if (!text) throw new HttpError(400, 'Paste the reply text first')
    extra.REPLY = text
    if (b.language) extra.LANGUAGE = str(b.language, 40)
    if (b.offer) extra.OFFER = str(b.offer, 2000)
    if (b.sent) extra.SENT = str(b.sent, 3000)
  }
  if (b.note) extra.user_note = str(b.note, 1000)
  if (b.sender) extra.SENDER = str(b.sender, 200)
  const result = await runAi(kind, { business, extra, force: !!b.force, apiKey: str(req.headers.get('x-anthropic-key'), 300) })
  if (business && !result.cached) await logActivity(business.id, `ai_${kind}`, `AI ${kind.replace('_', ' ')} generated`)
  return json(result)
})
