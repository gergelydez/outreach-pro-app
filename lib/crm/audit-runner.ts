// Rulează auditurile din coadă direct pe server (fără workerul Python).
import { q, one } from './db'
import { claimJobs, completeJob, failJob } from './jobs'
import { applyAudit } from './businesses'
import { quickAudit } from './quick-audit'
import { logUsage } from './activity'

export interface AuditRunResult { processed: { business_id: string; name: string; status?: string; score?: number; error?: string }[]; remaining: number }

export async function runPendingAudits(limit = 4, opts: { fetchImpl?: typeof fetch; allowPrivate?: boolean } = {}): Promise<AuditRunResult> {
  const jobs = await claimJobs('built-in', Math.max(1, Math.min(limit, 8)))
  const ids = jobs.map(j => j.business_id).filter(Boolean) as string[]
  const biz = ids.length ? await q<{ id: string; name: string; city: string | null; phone: string | null; website_url: string | null }>(
    'SELECT id, name, city, phone, website_url FROM businesses WHERE id = ANY($1)', [ids]) : []
  const byId = new Map(biz.map(b => [b.id, b]))
  const pagespeedKey = process.env.PAGESPEED_API_KEY || undefined
  // doar pentru teste locale (site-uri pe 127.0.0.1) — niciodată în producție
  if (opts.allowPrivate === undefined && process.env.AUDIT_ALLOW_PRIVATE_TARGETS === '1') opts = { ...opts, allowPrivate: true }
  // descărcările în paralel; scrierile în bază pe rând
  const facts = await Promise.all(jobs.map(async j => {
    const b = j.business_id ? byId.get(j.business_id) : undefined
    if (!b) return null
    try { return await quickAudit(b, { ...opts, pagespeedKey }) } catch (e) { return e instanceof Error ? e : new Error(String(e)) }
  }))
  const processed: AuditRunResult['processed'] = []
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i], f = facts[i], b = j.business_id ? byId.get(j.business_id) : undefined
    if (!b || !f) { await completeJob(j.id); continue }
    if (f instanceof Error) { await failJob(j.id, f.message); processed.push({ business_id: b.id, name: b.name, error: f.message }); continue }
    try {
      if (f.pagespeed) await logUsage({ provider: 'pagespeed', operation: 'runPagespeed', costUsd: 0, ok: !!f.pagespeed.fetched })
      const r = await applyAudit(b.id, f)
      await completeJob(j.id)
      processed.push({ business_id: b.id, name: b.name, ...r })
    } catch (e) {
      await failJob(j.id, e instanceof Error ? e.message : String(e))
      processed.push({ business_id: b.id, name: b.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const rem = await one<{ n: string }>(`SELECT count(*)::text AS n FROM audit_jobs WHERE status = 'pending' AND run_after <= now()`)
  return { processed, remaining: Number(rem?.n || 0) }
}

// Auditul unei singure firme, acum (de ex. după ce utilizatorul a adăugat linkul site-ului găsit pe Google)
export async function auditBusinessNow(id: string, opts: { fetchImpl?: typeof fetch; allowPrivate?: boolean } = {}) {
  const b = await one<{ id: string; name: string; city: string | null; phone: string | null; website_url: string | null }>(
    'SELECT id, name, city, phone, website_url FROM businesses WHERE id = $1', [id])
  if (!b) throw new Error('Business not found')
  if (opts.allowPrivate === undefined && process.env.AUDIT_ALLOW_PRIVATE_TARGETS === '1') opts = { ...opts, allowPrivate: true }
  const facts = await quickAudit(b, { ...opts, pagespeedKey: process.env.PAGESPEED_API_KEY || undefined })
  const r = await applyAudit(b.id, facts)
  // joburile de audit încă în coadă pentru această firmă nu mai sunt necesare
  await q(`UPDATE audit_jobs SET status = 'done', updated_at = now() WHERE business_id = $1 AND status = 'pending'`, [id])
  const a = await one<{ findings: { code: string }[] }>('SELECT findings FROM website_audits WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1', [id])
  return { ...r, findingCodes: (a?.findings || []).map(f => f.code), reachable: facts.reachable }
}
