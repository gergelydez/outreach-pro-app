import { route, json, body, str, requireUuid, HttpError } from '@/lib/crm/api'
import { q, one } from '@/lib/crm/db'
import { changeStage, isSuppressed, type BusinessRow } from '@/lib/crm/businesses'
import { checkContact } from '@/lib/crm/compliance'
import { logActivity } from '@/lib/crm/activity'
import { normalizePhone, asCountry } from '@/lib/crm/countries'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'
type Ctx = { params: { id: string } }

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await one<BusinessRow>('SELECT * FROM businesses WHERE id = $1', [id])
  if (!b) throw new HttpError(404, 'Lead not found')
  const [audits, score, analyses, messages, events, notes, activity, tasks, proposals, stages] = await Promise.all([
    q('SELECT id, url, final_url, reachable, website_status, facts, findings, pagespeed, error, created_at FROM website_audits WHERE business_id = $1 ORDER BY created_at DESC LIMIT 5', [id]),
    one('SELECT score, label, factors, created_at FROM lead_scores WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1', [id]),
    q('SELECT id, kind, prompt_version, model, output, created_at FROM ai_analyses WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20', [id]),
    q('SELECT * FROM outreach_messages WHERE business_id = $1 ORDER BY created_at DESC', [id]),
    q('SELECT * FROM outreach_events WHERE business_id = $1 ORDER BY occurred_at DESC', [id]),
    q('SELECT * FROM crm_notes WHERE business_id = $1 ORDER BY created_at DESC', [id]),
    q('SELECT * FROM crm_activity WHERE business_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
    q("SELECT * FROM follow_up_tasks WHERE business_id = $1 ORDER BY (status = 'open') DESC, due_at", [id]),
    q('SELECT id, title, status, total, currency, created_at FROM proposals WHERE business_id = $1 ORDER BY created_at DESC', [id]),
    q('SELECT * FROM pipeline_events WHERE business_id = $1 ORDER BY created_at DESC', [id]),
  ])
  const duplicateOf = b.possible_duplicate_of ? await one('SELECT id, name, address FROM businesses WHERE id = $1', [b.possible_duplicate_of]) : null
  const suppressed = await isSuppressed(b)
  const compliance = Object.fromEntries((['email', 'whatsapp', 'contact_form', 'phone'] as const).map(ch =>
    [ch, checkContact({ channel: ch, subscriberType: b.subscriber_type, suppressed, lawfulBasis: b.lawful_basis })]))
  return json({ business: b, audits, score, analyses, messages, events, notes, activity, tasks, proposals, stages, duplicateOf, suppressed, compliance })
})

const EDITABLE: Record<string, (v: unknown) => unknown> = {
  email: v => str(v, 200)?.toLowerCase() ?? null,
  phone: v => str(v, 40),
  deal_value: v => (v === '' || v == null ? null : Math.max(0, Number(v)) || 0),
  subscriber_type: v => (['corporate', 'sole_trader', 'unknown'].includes(String(v)) ? v : 'unknown'),
  lawful_basis: v => str(v, 300),
  consent_notes: v => str(v, 1000),
  next_follow_up_at: v => (v ? new Date(String(v)).toISOString() : null),
  website_url: v => str(v, 300),
  possible_duplicate_of: v => (v === null ? null : undefined), // doar „nu e duplicat”
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const b = await body<Record<string, unknown>>(req)
  if (typeof b.stage === 'string') await changeStage(id, b.stage)
  const sets: string[] = []
  const vals: unknown[] = [id]
  const sources: Record<string, unknown> = {}
  for (const [k, fn] of Object.entries(EDITABLE)) {
    if (!(k in b)) continue
    const v = fn(b[k])
    if (v === undefined) continue
    vals.push(v); sets.push(`${k} = $${vals.length}`)
    if (['email', 'phone', 'website_url'].includes(k)) sources[k] = { source: 'manual', verified: true, checked_at: new Date().toISOString() }
    if (k === 'phone') {
      const c = await one<{ country: string }>('SELECT country FROM businesses WHERE id = $1', [id])
      vals.push(normalizePhone(String(v || ''), asCountry(c?.country))); sets.push(`phone_e164 = $${vals.length}`)
    }
  }
  if (sets.length) {
    vals.push(JSON.stringify(sources)); sets.push(`field_sources = field_sources || $${vals.length}::jsonb`)
    await q(`UPDATE businesses SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals)
  }
  // verificat de utilizator în WhatsApp (deschizând chatul): are / nu are
  if (b.whatsapp_status === 'FOUND' || b.whatsapp_status === 'NOT_FOUND' || b.whatsapp_status === 'UNVERIFIED') {
    await q(`UPDATE businesses SET whatsapp_status = $2, whatsapp_source = $3, whatsapp_checked_at = now(), updated_at = now() WHERE id = $1`,
      [id, b.whatsapp_status, b.whatsapp_status === 'UNVERIFIED' ? null : 'manual'])
    await logActivity(id, 'whatsapp_checked', b.whatsapp_status === 'FOUND' ? 'WhatsApp confirmed manually' : b.whatsapp_status === 'NOT_FOUND' ? 'No WhatsApp on this number (checked manually)' : 'WhatsApp check reset')
  }
  if (typeof b.preview_url === 'string' && /^https?:\/\/[^\s]+\/p\/[a-z0-9-]+$/.test(b.preview_url)) {
    await q(`UPDATE businesses SET preview_url = $2, demo_at = now(), updated_at = now() WHERE id = $1`, [id, b.preview_url])
    await logActivity(id, 'demo_published', `Demo website published: ${b.preview_url}`)
  }
  if (Array.isArray(b.tags)) await q('UPDATE businesses SET tags = $2, updated_at = now() WHERE id = $1', [id, b.tags.map(t => String(t).toLowerCase().slice(0, 40)).slice(0, 20)])
  return json({ ok: true })
})

// Ștergere definitivă (GDPR), opțional cu adăugare în lista de excludere, ca lead-ul să nu mai fie importat
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = requireUuid(params.id)
  const suppress = new URL(req.url).searchParams.get('suppress') === '1'
  const b = await one<BusinessRow>('SELECT * FROM businesses WHERE id = $1', [id])
  if (!b) throw new HttpError(404, 'Lead not found')
  if (suppress) {
    const entries: [string, string | null | undefined][] = [['email', b.email?.toLowerCase()], ['phone', b.phone_e164], ['domain', b.website_domain], ['place', b.google_place_id]]
    for (const [kind, value] of entries) {
      if (value) await q(`INSERT INTO suppression_list (kind, value, reason) VALUES ($1, $2, 'deleted on request') ON CONFLICT DO NOTHING`, [kind, value])
    }
  }
  await q('DELETE FROM businesses WHERE id = $1', [id])
  await logActivity(null, 'lead_deleted', `Deleted a lead${suppress ? ' and added it to the suppression list' : ''}`)
  return json({ ok: true })
})
