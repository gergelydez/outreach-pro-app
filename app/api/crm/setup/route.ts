import { route, json } from '@/lib/crm/api'
import { db, runMigrations, pendingMigrations } from '@/lib/crm/db'
import { aiConfig } from '@/lib/crm/ai'

export const dynamic = 'force-dynamic'

// Starea configurării: ce variabile există (fără valori) și dacă baza e migrată
export const GET = route(async () => {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    CRM_PASSWORD: !!process.env.CRM_PASSWORD,
    CRM_SESSION_SECRET: !!process.env.CRM_SESSION_SECRET,
    CRM_WORKER_TOKEN: !!process.env.CRM_WORKER_TOKEN,
    GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
    OPENAI_API_KEY: !!aiConfig().key,
    OPENAI_MODEL: aiConfig().model || null,
    OPENAI_COSTS_SET: !!(process.env.OPENAI_INPUT_COST_PER_1M && process.env.OPENAI_OUTPUT_COST_PER_1M),
    CRON_SECRET: !!process.env.CRON_SECRET,
  }
  let database: { connected: boolean; pending: string[]; error?: string } = { connected: false, pending: [] }
  if (env.DATABASE_URL) {
    try { await db().query('SELECT 1'); database = { connected: true, pending: await pendingMigrations() } }
    catch { database = { connected: false, pending: [], error: 'Could not connect to the database. Check DATABASE_URL.' } }
  }
  // Workerul raportează prin preluarea joburilor; ultima preluare arată dacă rulează
  let worker: { last_seen: string | null } = { last_seen: null }
  if (database.connected && !database.pending.length) {
    const r = await db().query(`SELECT max(updated_at) AS last FROM app_settings WHERE key LIKE 'worker:%'`)
    worker = { last_seen: r.rows[0]?.last ?? null }
  }
  return json({ env, database, worker })
})

export const POST = route(async () => {
  const applied = await runMigrations()
  return json({ ok: true, applied })
})
