// Coadă de joburi în Postgres: idempotență prin cheie unică, preluare cu
// FOR UPDATE SKIP LOCKED (mai mulți workeri nu iau același job), reîncercări cu
// backoff exponențial și „dead letter” după max_attempts.
import { q, one } from './db'

export interface Job {
  id: string; type: string; business_id: string | null; payload: Record<string, unknown>
  status: string; attempts: number; max_attempts: number; run_after: string; last_error: string | null
}

export const LOCK_TIMEOUT_MIN = 10

export async function enqueueJob(type: string, businessId: string | null, payload: Record<string, unknown> = {}, opts: { key?: string; runAfter?: Date; maxAttempts?: number } = {}): Promise<string | null> {
  const row = await one<{ id: string }>(
    `INSERT INTO audit_jobs (type, business_id, payload, idempotency_key, run_after, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [type, businessId, JSON.stringify(payload), opts.key ?? null, (opts.runAfter ?? new Date()).toISOString(), opts.maxAttempts ?? 4])
  return row?.id ?? null
}

export async function claimJobs(workerId: string, limit: number, types: string[] = ['audit']): Promise<Job[]> {
  // joburile blocate de un worker căzut revin în coadă după LOCK_TIMEOUT_MIN
  await q(`UPDATE audit_jobs SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
           WHERE status = 'running' AND locked_at < now() - ($1 || ' minutes')::interval`, [String(LOCK_TIMEOUT_MIN)])
  return q<Job>(
    `UPDATE audit_jobs SET status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1, updated_at = now()
     WHERE id IN (
       SELECT id FROM audit_jobs
       WHERE status = 'pending' AND run_after <= now() AND type = ANY($3)
       ORDER BY run_after, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $2)
     RETURNING id, type, business_id, payload, status, attempts, max_attempts, run_after, last_error`,
    [workerId, Math.max(1, Math.min(limit, 20)), types])
}

export async function completeJob(id: string) {
  await q(`UPDATE audit_jobs SET status = 'done', locked_at = NULL, last_error = NULL, updated_at = now() WHERE id = $1`, [id])
}

// Backoff: 2, 4, 8… minute; după max_attempts jobul devine 'dead' (vizibil în monitor)
export async function failJob(id: string, error: string, retryable = true): Promise<'pending' | 'dead'> {
  const job = await one<{ attempts: number; max_attempts: number }>('SELECT attempts, max_attempts FROM audit_jobs WHERE id = $1', [id])
  if (!job) return 'dead'
  const dead = !retryable || job.attempts >= job.max_attempts
  const delayMin = Math.min(240, 2 ** Math.max(1, job.attempts))
  await q(`UPDATE audit_jobs SET status = $2, locked_at = NULL, last_error = $3,
           run_after = CASE WHEN $2 = 'pending' THEN now() + ($4 || ' minutes')::interval ELSE run_after END, updated_at = now()
           WHERE id = $1`, [id, dead ? 'dead' : 'pending', error.slice(0, 1000), String(delayMin)])
  return dead ? 'dead' : 'pending'
}

export async function cancelJob(id: string): Promise<boolean> {
  const r = await q(`UPDATE audit_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status IN ('pending', 'dead') RETURNING id`, [id])
  return r.length > 0
}

export async function retryJob(id: string): Promise<boolean> {
  const r = await q(`UPDATE audit_jobs SET status = 'pending', attempts = 0, run_after = now(), last_error = NULL, updated_at = now()
                     WHERE id = $1 AND status IN ('dead', 'cancelled', 'done') RETURNING id`, [id])
  return r.length > 0
}

export async function jobCounts(): Promise<Record<string, number>> {
  const rows = await q<{ status: string; n: string }>('SELECT status, count(*)::text AS n FROM audit_jobs GROUP BY status')
  return Object.fromEntries(rows.map(r => [r.status, Number(r.n)]))
}
