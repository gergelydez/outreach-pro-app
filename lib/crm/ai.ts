// Asistentul AI de vânzări — Claude API (aceeași cheie ANTHROPIC_API_KEY ca restul aplicației),
// doar pe server. Răspunsuri structurate cu JSON Schema (output_config.format); cache după
// hash-ul intrării; limită de cereri pe oră; costul estimat din tokenii raportați de API.
import Anthropic from '@anthropic-ai/sdk'
import { q, one } from './db'
import { logUsage } from './activity'
import { getSettings, type CrmSettings } from './settings'
import { sha256Hex } from './normalize'
import { checkContact, OPT_OUT_LINE } from './compliance'
import type { BusinessRow } from './businesses'
import type { Finding, ScoreFactor } from './audit-types'
import { WEBSITE_STATUS_LABEL } from './constants'

export class AiConfigError extends Error {}
export class AiRateLimitError extends Error {}

export const DEFAULT_MODEL = 'claude-opus-5-5'
// Prețuri USD per 1M tokeni (intrare / ieșire) pentru estimarea costului; suprascrise de
// CLAUDE_INPUT_COST_PER_1M / CLAUDE_OUTPUT_COST_PER_1M dacă folosești alt model.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-4-6': [3, 15], 'claude-opus-4-8': [5, 25],
}
export function aiConfig() {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL
  const [inP, outP] = PRICES[model] || [0, 0]
  return {
    key: process.env.ANTHROPIC_API_KEY || '',
    model,
    inputPer1M: Number(process.env.CLAUDE_INPUT_COST_PER_1M || inP),
    outputPer1M: Number(process.env.CLAUDE_OUTPUT_COST_PER_1M || outP),
  }
}

const PROMPT_VERSIONS = { analysis: 'analysis-v1', outreach: 'outreach-v1', proposal: 'proposal-v1', reply: 'reply-v1', next_action: 'next-action-v1' } as const
export type AiKind = keyof typeof PROMPT_VERSIONS

const S = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props })
const str = { type: 'string' }
const strArr = { type: 'array', items: { type: 'string' } }

const SCHEMAS: Record<AiKind, Record<string, unknown>> = {
  analysis: S({
    business_summary: str, website_status: str, verified_problems: strArr, business_opportunities: strArr,
    recommended_services: strArr, recommended_offer: str, sales_angle: str, potential_objections: strArr,
    recommended_next_action: str, confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, evidence: strArr, unknowns: strArr,
    summary_ro: str,
  }),
  outreach: S({
    email_subject: str, email_body: str, whatsapp_message: str, contact_form_message: str, follow_up_message: str,
    linkedin_message: str, finding_used: str, explanation_ro: str,
  }),
  proposal: S({ title: str, intro: str, scope: str, timeline_note: str, recommended_service_keys: strArr, reasons: strArr }),
  reply: S({
    translation_ro: str, intent: { type: 'string', enum: ['interested', 'question', 'objection', 'not_interested', 'later', 'unsubscribe', 'other'] },
    intent_explained_ro: str, objection_type: { type: 'string', enum: ['too_expensive', 'already_have_website', 'not_interested', 'already_have_someone', 'contact_later', 'send_more_info', 'none', 'other'] },
    suggested_reply_en: str, suggested_reply_ro: str, next_step: str,
  }),
  next_action: S({ action: str, reason: str, reason_ro: str, suggested_stage: str }),
}

const SYSTEM = `You are a careful sales assistant for a small web design business selling to UK trades and local service businesses.
Rules you must follow:
- Use ONLY the facts provided in the CONTEXT. Never invent names, prices paid, numbers, reviews, awards, years in business or website problems.
- If something is listed as unknown, treat it as unknown and say so where relevant.
- Write natural, plain British English (en-GB spelling). No hype, no exclamation marks in every sentence, no "I hope this email finds you well", no "revolutionise", no fake urgency.
- Reference at most one or two specific, verified findings. Explain the practical benefit for the business's customers.
- Low-pressure: offer to share ideas or a short example; never promise results (rankings, number of leads, revenue).
- Romanian fields must be in natural Romanian with diacritics.`

const INSTRUCTIONS: Record<AiKind, string> = {
  analysis: 'Analyse this business as a sales opportunity for website/local SEO services. Put each verified problem with its evidence. Include potential objections and the single best next action. Fill "unknowns" with important facts we do not have. Add summary_ro: a short Romanian summary for the user.',
  outreach: `Write first-contact messages for this business. email_body: 80-130 words, greeting, who I am in half a sentence, one specific verified finding and why it matters to their customers, a low-pressure question as the next step, the sign-off, and this exact opt-out line at the end: "${OPT_OUT_LINE}". whatsapp_message: max 4 short lines. contact_form_message: 60-90 words. follow_up_message: a short, polite follow-up for 3-7 days later that adds one new useful point. linkedin_message: max 280 characters. finding_used: which finding you used. explanation_ro: explain in Romanian what each message says and why, so the user understands it before sending.`,
  proposal: 'Draft proposal text for this business: title, intro (personal, 2 short paragraphs, based on verified findings), scope (bullet-style lines describing deliverables), timeline_note (no fixed promises; say it will be agreed). recommended_service_keys must only contain keys from the SERVICES list. Do not mention prices; they are added separately.',
  reply: 'The user received a reply from this business (REPLY). Translate it into Romanian, classify the intent and any objection, and suggest a short, honest reply in British English plus its Romanian translation. If they ask to stop, the suggested reply only confirms they will not be contacted again.',
  next_action: 'Suggest the single best next action for this lead given its stage, history and findings, with a short reason in English and Romanian, and the stage key it should move to (or the current one).',
}

export async function buildContext(b: BusinessRow, settings: CrmSettings) {
  const audit = await one<{ findings: Finding[]; facts: Record<string, unknown>; created_at: string }>(
    'SELECT findings, facts, created_at FROM website_audits WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id])
  const score = await one<{ score: number; factors: ScoreFactor[] }>('SELECT score, factors FROM lead_scores WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id])
  const events = await q<{ event_type: string; channel: string | null; occurred_at: string; notes: string | null }>(
    'SELECT event_type, channel, occurred_at, notes FROM outreach_events WHERE business_id = $1 ORDER BY occurred_at DESC LIMIT 10', [b.id])
  const unknown = (v: unknown) => (v == null || v === '' ? 'unknown' : v)
  return {
    business: {
      name: b.name, category: unknown(b.category), city: unknown(b.city), address: unknown(b.address),
      phone: unknown(b.phone), email: unknown(b.email), website: unknown(b.website_url),
      website_status: `${b.website_status} (${WEBSITE_STATUS_LABEL[b.website_status] || ''})`,
      google_rating: unknown(b.google_rating), google_review_count: unknown(b.google_review_count),
      whatsapp_link_on_site: b.whatsapp_status === 'FOUND' ? 'found' : b.whatsapp_status === 'NOT_FOUND' ? 'none detected on website (they may still use WhatsApp)' : 'unverified',
      subscriber_type: b.subscriber_type, stage: b.stage,
    },
    website_audit: audit ? { audited_at: audit.created_at, findings: audit.findings.map(f => ({ what: f.what, why: f.why, fix: f.fix, service: f.service })) } : 'not audited yet',
    opportunity: score ? { score: score.score, factors: score.factors.filter(f => f.points > 0).map(f => `${f.label}: ${f.evidence}`) } : 'not scored yet',
    outreach_history: events,
    seller: { name: settings.business_profile.sender_name || 'unknown', company: settings.business_profile.company_name || 'unknown', website: settings.business_profile.website || 'unknown', default_offer: settings.business_profile.default_offer },
    services: settings.services.map(s => ({ key: s.key, label: s.label, price_gbp: s.price, recurring: s.recurring || null })),
    compliance: checkContact({ channel: 'email', subscriberType: b.subscriber_type, suppressed: false, lawfulBasis: b.lawful_basis }).messages,
  }
}

export interface AiRunResult<T = Record<string, unknown>> { id: string; output: T; cached: boolean; model: string; inputTokens: number; outputTokens: number; costUsd: number }

export async function runAi<T = Record<string, unknown>>(kind: AiKind, opts: { business?: BusinessRow | null; extra?: Record<string, unknown>; force?: boolean; client?: Anthropic }): Promise<AiRunResult<T>> {
  const cfg = aiConfig()
  const { model } = cfg
  if (!opts.client && !cfg.key) throw new AiConfigError('Claude is not configured: set ANTHROPIC_API_KEY on the server (Vercel → Settings → Environment Variables).')
  const settings = await getSettings()
  const context = opts.business ? await buildContext(opts.business, settings) : { services: settings.services, seller: settings.business_profile }
  const payload = JSON.stringify({ context, extra: opts.extra || {} })
  const promptVersion = PROMPT_VERSIONS[kind]
  const hash = await sha256Hex(`${kind}|${promptVersion}|${model}|${payload}`)

  if (!opts.force) {
    const cached = await one<{ id: string; output: T; model: string }>(
      'SELECT id, output, model FROM ai_analyses WHERE kind = $1 AND input_hash = $2 ORDER BY created_at DESC LIMIT 1', [kind, hash])
    if (cached) return { id: cached.id, output: cached.output, cached: true, model: cached.model, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  }

  const limit = settings.limits.ai_requests_per_hour
  const used = await one<{ n: string }>(`SELECT count(*)::text AS n FROM api_usage WHERE provider = 'anthropic' AND created_at > now() - interval '1 hour'`)
  if (Number(used?.n || 0) >= limit) throw new AiRateLimitError(`AI limit reached (${limit} requests per hour). Change it in Settings.`)

  const client = opts.client || new Anthropic({ apiKey: cfg.key })
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // promptul de sistem e identic la fiecare cerere → se poate refolosi din cache
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `TASK: ${INSTRUCTIONS[kind]}\n\nCONTEXT (verified data; "unknown" means we do not know):\n${payload}` }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMAS[kind] } },
      // dacă modelul refuză din motive de siguranță, API-ul reîncearcă automat pe un model de rezervă
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (e) {
    await logUsage({ provider: 'anthropic', operation: kind, ok: false, error: e instanceof Error ? e.message : String(e) })
    throw e
  }
  const u = res.usage
  const inputTokens = (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0)
  const outputTokens = u?.output_tokens ?? 0
  const costUsd = ((u?.input_tokens ?? 0) * cfg.inputPer1M + (u?.cache_creation_input_tokens ?? 0) * cfg.inputPer1M * 1.25
    + (u?.cache_read_input_tokens ?? 0) * cfg.inputPer1M * 0.1 + outputTokens * cfg.outputPer1M) / 1_000_000
  await logUsage({ provider: 'anthropic', operation: kind, inputTokens, outputTokens, costUsd, ok: res.stop_reason !== 'refusal' && res.stop_reason !== 'max_tokens' })

  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request. Edit the notes or reply text and try again.')
  if (res.stop_reason === 'max_tokens') throw new Error('The AI response was cut off. Try again.')
  const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  let output: T
  try { output = JSON.parse(text) as T } catch { throw new Error('The AI response was not valid JSON. Try again.') }
  const row = await one<{ id: string }>(
    `INSERT INTO ai_analyses (business_id, kind, prompt_version, input_hash, model, output, input_tokens, output_tokens, cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [opts.business?.id ?? null, kind, promptVersion, hash, res.model || model, JSON.stringify(output), inputTokens, outputTokens, costUsd])
  return { id: row!.id, output, cached: false, model: res.model || model, inputTokens, outputTokens, costUsd }
}
