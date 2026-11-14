import { route, json } from '@/lib/crm/api'
import { db, runMigrations, pendingMigrations, storageKind } from '@/lib/crm/db'
import { aiConfig } from '@/lib/crm/ai'

// pornirea la rece (încărcarea bazei din Blob) + așteptarea după alte cereri poate depăși 10 s
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Starea configurării: ce variabile există (fără valori) și dacă baza e migrată
export const GET = route(async () => {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    STORAGE: storageKind(),
    CRM_PASSWORD: !!process.env.CRM_PASSWORD,
    CRM_SESSION_SECRET: !!process.env.CRM_SESSION_SECRET,
    CRM_WORKER_TOKEN: !!process.env.CRM_WORKER_TOKEN,
    GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
    ANTHROPIC_API_KEY: !!aiConfig().key,
    CLAUDE_MODEL: aiConfig().model,
    CRON_SECRET: !!process.env.CRON_SECRET,
  }
  let database: { connected: boolean; pending: string[]; error?: string } = { connected: false, pending: [] }
  if (env.STORAGE !== 'none') {
    try { await db().query('SELECT 1'); database = { connected: true, pending: await pendingMigrations() } }
    catch (e) {
      console.error('[crm setup]', e)
      database = { connected: false, pending: [], error: env.STORAGE === 'postgres' ? 'Could not connect to the database. Check DATABASE_URL.' : `Could not open the CRM data in Vercel Blob: ${e instanceof Error ? e.message : e}` }
    }
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
